import { generatePrivateKey, getPublicKey, nip19 } from 'nostr-tools'
import { NIP46_PRIVATE_KEY_STORAGE_KEY, NOSTR_PRIVATE_KEY_STORAGE_KEY, NOSTR_PUBLIC_KEY_STORAGE_KEY } from '../constants'
import { NostrRequest } from './autogenerated/ts/nostr_transport'
import NewNostrClient from './autogenerated/ts/nostr_client'
import NostrHandler from './nostrHandler'
import { ProfilePointer } from 'nostr-tools/lib/nip19'
import { Nip46Request, Nip46Response, serializeNip46Event } from './nip46'
const requestExpirationSeconds = 10
export const setNostrPrivateKey = (nsec?: string) => {
    const key = nsec ? nsec : generatePrivateKey()
    localStorage.setItem(NOSTR_PRIVATE_KEY_STORAGE_KEY, key)
}
export const getNostrPrivateKey = () => {
    return localStorage.getItem(NOSTR_PRIVATE_KEY_STORAGE_KEY)
}
export const setNip46PrivateKey = (nsec?: string) => {
    const key = nsec ? nsec : generatePrivateKey()
    localStorage.setItem(NIP46_PRIVATE_KEY_STORAGE_KEY, key)
}
export const getNip46PrivateKey = () => {
    return localStorage.getItem(NIP46_PRIVATE_KEY_STORAGE_KEY)
}

type Client = ReturnType<typeof NewNostrClient>
type PendingClient = { type: 'promise', queue: ((c: Client) => void)[] }
type ReadyClient = { type: 'client', client: Client, disconnectCalls: () => void }
type StoredClient = PendingClient | ReadyClient
const clients: Record<string, StoredClient> = {}

type Nip46Sender = (req: Nip46Request) => Promise<Nip46Response>
type PendingNip46Sender = { type: 'promise', queue: ((c: Nip46Sender) => void)[] }
type ReadyNip46Sender = { type: 'sender', sender: Nip46Sender }
type StoredNip46Sender = PendingNip46Sender | ReadyNip46Sender
const nip46Senders: Record<string, StoredNip46Sender> = {}


export const parseNprofile = (nprofile: string) => {
    const { type, data } = nip19.decode(nprofile)
    //console.log({ newNprofile: nip19.nprofileEncode({ pubkey: "e306c45ee0a7c772540f1dc88b00f79d2d3910bfd4047e910584998de9c9e2be", relays: ['wss://strfry.shock.network'] }) })
    if (type !== "nprofile") {
        throw new Error("invalid bech32 this is not a nprofile")
    }
    const dataString = JSON.stringify(data);
    const dataBox = JSON.parse(dataString);

    return dataBox as ProfilePointer;
}

export const disconnectNostrClientCalls = async (nProfile: { pubkey: string, relays?: string[] } | string) => {
    const { pubkey } = typeof nProfile === 'string' ? parseNprofile(nProfile) : nProfile
    const c = clients[pubkey]
    if (c.type !== 'client') {
        return
    }
    c.disconnectCalls()
}

export const getNostrClient = async (nProfile: { pubkey: string, relays?: string[] } | string): Promise<Client> => {
    const { pubkey, relays } = typeof nProfile === 'string' ? parseNprofile(nProfile) : nProfile
    const c = clients[pubkey]
    if (c && c.type === 'client') {
        return c.client
    }
    if (c && c.type === 'promise') {
        return new Promise<Client>((res) => {
            (clients[pubkey] as PendingClient).queue.push(res)
        })
    }
    if (!relays) {
        throw new Error("cannot create client if no relays are provided")
    }
    clients[pubkey] = { type: 'promise', queue: [] }
    const { readyClient, disconnectCalls } = await createNostrClient(pubkey, relays)
    const queue = (clients[pubkey] as PendingClient).queue
    clients[pubkey] = { type: 'client', client: readyClient, disconnectCalls }
    queue.forEach(f => f(readyClient))
    return readyClient
}

type nostrCallback<T> = { type: 'single' | 'stream', f: (res: T) => void }
const createNostrClient = async (pubDestination: string, relays: string[]) => {
    const clientCbs: Record<string, nostrCallback<any>> = {}
    const disconnectCalls = () => {
        for (const key in clientCbs) {
            const element = clientCbs[key]
            element.f({ status: "ERROR", reason: "nostr connection timeout" })
            delete clientCbs[key]
        }
    }
    let connected = false
    const privateKey = getNostrPrivateKey()
    if (!privateKey) {
        throw new Error("client not initialized correctly")
    }
    const publicKey = getPublicKey(privateKey)
    const handler = await new Promise<NostrHandler>((res) => {
        const h = new NostrHandler({
            privateKey,
            publicKey,
            relays
        },
            () => { if (!connected) { connected = true; res(h) } },
            e => {
                const res = JSON.parse(e.content) as { requestId: string }
                if (clientCbs[res.requestId]) {
                    const cb = clientCbs[res.requestId]

                    cb.f(res)
                    if (cb.type === 'single') {
                        delete clientCbs[res.requestId]
                    }
                } else {
                    console.log("cb not found for", res)
                }
            })
    })
    const clientSend = (to: string, message: NostrRequest): Promise<any> => {
        if (!message.requestId) {
            message.requestId = makeId(16)
        }
        const reqId = message.requestId
        if (clientCbs[reqId]) {
            throw new Error("request was already sent")
        }
        handler.Send(to, JSON.stringify(message))

        console.log("subbing  to single send", reqId)
        return new Promise(res => {
            clientCbs[reqId] = {
                type: 'single',
                f: (response: any) => { res(response) },
            }
        })
    }
    const clientSub = (to: string, message: NostrRequest, cb: (res: any) => void): void => {
        if (!message.requestId) {
            message.requestId = message.rpcName
        }
        const reqId = message.requestId
        if (!reqId) {
            throw new Error("invalid sub")
        }
        if (clientCbs[reqId]) {
            clientCbs[reqId] = {
                type: 'stream',
                f: (response: any) => { cb(response) },
            }
            console.log("sub for", reqId, "was already registered, overriding")
            return
        }
        handler.Send(to, JSON.stringify(message))
        console.log("subbing  to stream", reqId)
        clientCbs[reqId] = {
            type: 'stream',
            f: (response: any) => { cb(response) }
        }
    }
    const readyClient = NewNostrClient({
        retrieveNostrUserAuth: async () => { return publicKey },
        pubDestination,
    }, clientSend, clientSub)
    return { readyClient, disconnectCalls }
}


export const getNip46Sender = async (nProfile: { pubkey: string, relays?: string[] } | string): Promise<Nip46Sender> => {
    const { pubkey, relays } = typeof nProfile === 'string' ? parseNprofile(nProfile) : nProfile
    const c = nip46Senders[pubkey]
    if (c && c.type === 'sender') {
        return c.sender
    }
    if (c && c.type === 'promise') {
        return new Promise<Nip46Sender>((res) => {
            (nip46Senders[pubkey] as PendingNip46Sender).queue.push(res)
        })
    }
    if (!relays) {
        throw new Error("cannot create client if no relays are provided")
    }
    nip46Senders[pubkey] = { type: 'promise', queue: [] }
    const { sendNip46 } = await newNip46Sender(pubkey, relays)
    const queue = (nip46Senders[pubkey] as PendingNip46Sender).queue
    nip46Senders[pubkey] = { type: 'sender', sender: sendNip46 }
    queue.forEach(f => f(sendNip46))
    return sendNip46
}

export const newNip46Sender = async (pubDestination: string, relays: string[]) => {
    const privateKey = getNip46PrivateKey()
    if (!privateKey) {
        throw new Error("nip46 client not initialized correctly")
    }
    const clientCbs: Record<string, nostrCallback<Nip46Response>> = {}
    const publicKey = getPublicKey(privateKey)
    let connected = false
    const handler = await new Promise<NostrHandler>((res) => {
        const h = new NostrHandler({
            privateKey,
            publicKey,
            relays
        },
            () => { if (!connected) { connected = true; res(h) } },
            e => {
                const res = JSON.parse(e.content) as Nip46Response
                if (clientCbs[res.id]) {
                    const cb = clientCbs[res.id]

                    cb.f(res)
                    if (cb.type === 'single') {
                        delete clientCbs[res.id]
                    }
                } else {
                    console.log("cb not found for", res)
                }
            })
    })
    const sendNip46 = (req: Nip46Request): Promise<Nip46Response> => {
        const reqId = makeId(16)
        const message = serializeNip46Event(reqId, req)
        if (clientCbs[reqId]) {
            throw new Error("request was already sent")
        }
        handler.SendNip46(pubDestination, message)

        console.log("subbing  to single send", reqId)
        return new Promise(res => {
            clientCbs[reqId] = {
                type: 'single',
                f: (response: Nip46Response) => { res(response) },
            }
        })
    }
    return { sendNip46 }
}

function makeId(length: number) {
    var result = '';
    var characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    var charactersLength = characters.length;
    for (var i = 0; i < length; i++) {
        result += characters.charAt(Math.floor(Math.random() * charactersLength));
    }
    return result;
}

//@ts-ignore use this to have access to the client from the console
// global.nostr = nostr // TODO: remove,DEV ONLY