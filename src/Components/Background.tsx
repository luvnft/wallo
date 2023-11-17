import React, { useEffect, useState } from "react";
import { useDispatch, useSelector } from "../State/store";
import { setLatestOperation, setSourceHistory } from "../State/Slices/HistorySlice";
import { getNostrClient } from "../Api";
import * as Types from '../Api/autogenerated/ts/types'
import { addNotification } from "../State/Slices/notificationSlice";
import { notification } from "antd";
import { NotificationPlacement } from "antd/es/notification/interface";
import { addTransaction } from "../State/Slices/transactionSlice";
import { NOSTR_PRIVATE_KEY_STORAGE_KEY, NOSTR_PUB_DESTINATION, NOSTR_RELAYS, getFormattedTime } from "../constants";
import { useIonRouter } from "@ionic/react";
import { Modal } from "./Modals/Modal";
import { UseModal } from "../Hooks/UseModal";
import { isBrowser, isWindows } from "react-device-detect";
import * as icons from '../Assets/SvgIconLibrary';
import { Clipboard } from '@capacitor/clipboard';
import { validate } from 'bitcoin-address-validation';
import { nip19 } from "nostr-tools";

export const Background = () => {

    const router = useIonRouter();
    //reducer
    const nostrSource = useSelector((state) => state.paySource).map((e) => { return { ...e } }).filter((e) => e.pasteField.includes("nprofile"))
    const paySource = useSelector((state) => state.paySource)
    const spendSource = useSelector((state) => state.spendSource)
    const cursor = useSelector(({ history }) => history.cursor) || {}
    const latestOp = useSelector(({ history }) => history.latestOperation) || {}
    const transaction = useSelector(({ transaction }) => transaction) || {}
    const dispatch = useDispatch();
    const [initialFetch, setInitialFetch] = useState(true)
    const [api, contextHolder] = notification.useNotification();
    const [clipText, setClipText] = useState("")
    const { isShown, toggle } = UseModal();
    const openNotification = (placement: NotificationPlacement, header: string, text: string, onClick?:(() => void) | undefined) => {
        api.info({
          message: header,
          description:
            text,
          placement,
          onClick: onClick,
        });
    };
      
    useEffect(() => {
        const subbed: string[] = []
        nostrSource.forEach(source => {
            if (subbed.find(s => s === source.pasteField)) {
                return
            }
            subbed.push(source.pasteField)
            getNostrClient(source.pasteField).then(c => {
                c.GetLiveUserOperations(newOp => {
                    if (newOp.status === "OK") {
                        openNotification("top", "Payments", "You received payment.");
                        dispatch(addTransaction({
                            amount: newOp.operation.amount+'',
                            memo: "",
                            time: Date.now(),
                            destination: newOp.operation.identifier,
                            inbound: true,
                            confirm: {},
                            invoice: "",
                        }))
                        dispatch(setLatestOperation({ operation: newOp.operation }))
                    } else {
                        console.log(newOp.reason)
                    }
                })
            })
        });

        const handleBeforeUnload = (event: BeforeUnloadEvent) => {
            event.preventDefault();
            // Call your function here
            localStorage.setItem("lastOnline", Date.now().toString())
        };
      
        window.addEventListener('beforeunload', handleBeforeUnload);
    }, [])

    useEffect(() => {
        const nostrSpends = spendSource.filter((e) => e.icon == "0");
        const otherPaySources = paySource.filter((e) => e.icon != "0");
        const otherSpendSources = spendSource.filter((e) => e.icon != "0");
        
        if ((nostrSpends.length!=0&&nostrSpends[0].balance != "0")||(otherPaySources.length>0||otherSpendSources.length>0)) {
            if (localStorage.getItem("isBackUp")=="1") {
                return;
            }
            console.log("changed",otherPaySources,otherSpendSources);
            dispatch(addNotification({
                header: 'Reminder',
                icon: '⚠️',
                desc: 'Back up your credentials!',
                date: Date.now(),
                link: '/auth',
            }))
            localStorage.setItem("isBackUp", "1")
            openNotification("top", "Reminder", "Please back up your credentials!", ()=>{router.push("/auth")});
        }
    }, [paySource, spendSource])

    useEffect(() => {
        if (Object.entries(latestOp).length === 0 && !initialFetch) {
            return
        }
        console.log({ latestOp, initialFetch })
        setInitialFetch(false)
        const sent: string[] = []
        nostrSource.forEach(source => {
            if (sent.find(s => s === source.pasteField)) {
                return
            }
            sent.push(source.pasteField)
            getNostrClient(source.pasteField).then(c => {
                const req = populateCursorRequest(cursor)
                c.GetUserOperations(req).then(ops => {
                    if (ops.status === 'OK') {
                        console.log((ops), "ops")
                        const totalHistory = parseOperationsResponse(ops);
                        const lastTimestamp = parseInt(localStorage.getItem('lastOnline')??"0")
                        const payments = totalHistory.operations.filter((e) => e.paidAtUnix*1000>lastTimestamp)
                        if (payments.length>0) {
                            dispatch(addNotification({
                                header: 'Payments',
                                icon: '⚡',
                                desc: 'You received '+ payments.length + ' payments since ' + getFormattedTime(lastTimestamp),
                                date: Date.now(),
                                link: '/home',
                            }))
                        }
                        dispatch(setSourceHistory({ nprofile: source.pasteField, ...parseOperationsResponse(ops) }))
                    } else {
                        console.log(ops.reason, "ops.reason")
                    }
                })
            })
        })
    }, [latestOp, initialFetch, transaction])

    useEffect(() => {
        window.addEventListener("visibilitychange", checkClipboard);
        window.addEventListener("focus", checkClipboard);
      
        return () => {
            window.removeEventListener("visibilitychange", checkClipboard);
            window.removeEventListener("focus", checkClipboard);
        };
    }, [])
    
    const checkClipboard = async () => {
        var text = '';
        document.getElementById('focus_div')?.focus();
        if (document.hidden) {        
            window.focus();
        }
        if (isBrowser) {
            try {
                const { type, value } = await Clipboard.read();
                text = value;
            } catch (error) {
                console.error('Error reading clipboard data:', error);
            }
        } else {
            try {
                const { type, value } = await Clipboard.read();
                text = value;
            } catch (error) {
                console.error('Error reading clipboard data:', error);
            }
        }
        console.log(text);
        
        if (text.length) {
            const expression: RegExp = /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i;
            const boolLnAddress = expression.test(text);
            var boolLnInvoice = false;
            if (text.startsWith("ln")) {
                const result = await (await getNostrClient( nip19.nprofileEncode({ pubkey: NOSTR_PUB_DESTINATION, relays: NOSTR_RELAYS }))).DecodeInvoice({invoice:text});
                boolLnInvoice = result.status=="OK";
            }
            const boolAddress = validate(text);
            const boolLnurl = text.startsWith("lnurl");
            if (boolAddress||boolLnInvoice||boolLnAddress||boolLnurl) {
                setClipText(text);
                toggle();
            }
        }
    };

    const clipBoardContent = <React.Fragment>
        <div className='Home_modal_header'>Clipboard Detected</div>
        <div className='Home_modal_discription'>Would you like to use it?</div>
        <div className='Home_modal_clipboard'>{clipText}</div>
        <div className="Home_add_btn">
            <div className='Home_add_btn_container'>
            <button onClick={toggle}>
                {icons.Close()}NO
            </button>
            </div>
            <div className='Home_add_btn_container'>
            <button onClick={()=>{}}>
                {icons.clipboard()}YES
            </button>
            </div>
        </div>
    </React.Fragment>;

    return <div id="focus_div">
      {contextHolder}
      <Modal isShown={isShown} hide={toggle} modalContent={clipBoardContent} headerText={''} />
    </div>
}

const populateCursorRequest = (p: Partial<Types.GetUserOperationsRequest>): Types.GetUserOperationsRequest => {
    return {
        // latestIncomingInvoice: p.latestIncomingInvoice || 0,
        // latestOutgoingInvoice: p.latestOutgoingInvoice || 0,
        // latestIncomingTx: p.latestIncomingTx || 0,
        // latestOutgoingTx: p.latestOutgoingTx || 0,
        // latestIncomingUserToUserPayment: p.latestIncomingUserToUserPayment || 0,
        // latestOutgoingUserToUserPayment: p.latestOutgoingUserToUserPayment || 0,
        
        latestIncomingInvoice: 0,
        latestOutgoingInvoice: 0,
        latestIncomingTx: 0,
        latestOutgoingTx: 0,
        latestIncomingUserToUserPayment: 0,
        latestOutgoingUserToUserPayment: 0,
    }
}

const parseOperationsResponse = (r: Types.GetUserOperationsResponse): { cursor: Types.GetUserOperationsRequest, operations: Types.UserOperation[] } => {
    const cursor = {
        latestIncomingInvoice: r.latestIncomingInvoiceOperations.toIndex,
        latestOutgoingInvoice: r.latestOutgoingInvoiceOperations.toIndex,
        latestIncomingTx: r.latestIncomingTxOperations.toIndex,
        latestOutgoingTx: r.latestOutgoingTxOperations.toIndex,
        latestIncomingUserToUserPayment: r.latestIncomingUserToUserPayemnts.toIndex,
        latestOutgoingUserToUserPayment: r.latestOutgoingUserToUserPayemnts.toIndex,
    }
    const operations = [
        ...r.latestIncomingInvoiceOperations.operations,
        ...r.latestOutgoingInvoiceOperations.operations,
        ...r.latestIncomingTxOperations.operations,
        ...r.latestOutgoingTxOperations.operations,
        ...r.latestIncomingUserToUserPayemnts.operations,
        ...r.latestOutgoingUserToUserPayemnts.operations,
    ]
    console.log({ operations })
    return { cursor, operations }
}
