import { keylinkUrl } from '../../constants'
import NewHttpClient from './autogenerated/ts/http_client'

export const keyLinkClient = NewHttpClient({
    baseUrl: keylinkUrl || "",
    retrieveGuestAuth: async () => { return "" },
    retrieveAdminAuth: async () => { throw new Error("admin routes not enabled") },
    retrieveAppAuth: async () => { throw new Error("app routes not enabled") },
    encryptCallback: async () => { throw new Error("encryption not enabled") },
    decryptCallback: async () => { throw new Error("encryption not enabled") },
    deviceId: "",
})
