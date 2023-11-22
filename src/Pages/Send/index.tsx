import React, { useEffect, useState } from 'react';
import { PageProps, SpendFrom } from "../../globalTypes";
import { getNostrClient } from '../../Api'
import { notification } from 'antd';
import { validate, getAddressInfo } from 'bitcoin-address-validation';

//It import svg icons library
import * as Icons from "../../Assets/SvgIconLibrary";
import { AddressType, PayAddressResponse, PayInvoiceResponse } from '../../Api/autogenerated/ts/types';
import { UseModal } from '../../Hooks/UseModal';
import { useSelector, useDispatch } from '../../State/store';
import type { NotificationPlacement } from 'antd/es/notification/interface';
import axios from 'axios';
import { useIonRouter } from '@ionic/react';
import { Modal } from '../../Components/Modals/Modal';
import SpendFromDropdown from '../../Components/Dropdowns/SpendFromDropdown';
import { useLocation } from 'react-router-dom';
import { addAddressbookLink } from '../../State/Slices/addressbookSlice';
import { nip19 } from 'nostr-tools';
import { defaultMempool, usdToBTCSpotLink } from '../../constants';
import { setLatestOperation } from '../../State/Slices/HistorySlice';
import { parseNprofile } from '../../Api/nostr';
import * as Types from '../../Api/autogenerated/ts/types'
import { ChainFeesInter } from '../Prefs';

type PayInvoice = {
  type: 'payInvoice'
  invoice: string
  amount: number
}
type PayAddress = {
  type: 'payAddress'
  address: string
  amount: number
}

export const Send = () => {
  //parameter in url when click protocol
  const addressSearch = new URLSearchParams(useLocation().search);;
  const urlParam = addressSearch.get("url");

  const price = useSelector((state) => state.usdToBTC);

  //reducer
  const dispatch = useDispatch();
  const paySource = useSelector((state) => state.paySource).map((e) => { return { ...e } });
  const spendSources = useSelector((state) => state.spendSource).map((e) => { return { ...e } });
  const mempoolUrl = useSelector(({ prefs }) => prefs.mempoolUrl) || defaultMempool;
  const BTCUSDUrl = useSelector(({ prefs }) => prefs.BTCUSDUrl) || usdToBTCSpotLink;
  const selectedChainFee = useSelector(({ prefs }) => prefs.selected);


  const [error, setError] = useState("")
  const [vReceive, setVReceive] = useState(1);
  const [amountAssets, setAmountAssets] = useState("sats");
  const [amount, setAmount] = useState(0);
  const [decodedAmount, setDecodedAmount] = useState(0);
  const [to, setTo] = useState("");
  const [note, setNote] = useState("");
  const { isShown, toggle } = UseModal();
  const [selectedSource, setSelectedSource] = useState(spendSources[0]);
  const [satsPerByte, setSatsPerByte] = useState(0)

  const nostrSource = paySource.filter((e: any) => e.pasteField.includes("nprofile"))

  const router = useIonRouter();

  const [api, contextHolder] = notification.useNotification();
  const openNotification = (placement: NotificationPlacement, header: string, text: string) => {
    api.info({
      message: header,
      description:
        text,
      placement
    });
  };
  const updateSatsPerByte = async () => {
    const res = await axios.get(mempoolUrl)
    const data = res.data as ChainFeesInter
    if (!selectedChainFee) {
      setSatsPerByte(data.economyFee)
      return
    }
    switch (selectedChainFee) {
      case "eco":
        console.log("eco!")
        setSatsPerByte(data.economyFee)
      case "avg":
        console.log("avg!")
        setSatsPerByte(Math.ceil((data.hourFee + data.halfHourFee) / 2))
      case "asap":
        console.log("asap!")
        setSatsPerByte(data.fastestFee)
    }
  }


  useEffect(() => {
    if (spendSources.length === 0) {
      setTimeout(() => {
        router.push("/home");
      }, 1000);
      return openNotification("top", "Error", "You don't have any source!");
    }
  }, []);

  useEffect(() => {
    onChangeTo(urlParam ?? "");
  }, [urlParam])

  const [loading, setLoading] = useState("none");
  const handleSubmit = async () => {
    setLoading("flex")
    if (selectedSource.pasteField.includes("nprofile")) {
      await payUsingNprofile();
      setLoading("none")
    } else {

    }
  }

  const paymentSuccess = (amount: number, identifier: string, type: Types.UserOperationType, { operation_id, network_fee, service_fee }: { operation_id: string, network_fee: number, service_fee: number }) => {
    setTimeout(() => {
      router.push("/home")
    }, 500);
    const { pubkey } = parseNprofile(selectedSource.pasteField)
    const now = Date.now() / 1000
    dispatch(setLatestOperation({ pub: pubkey, operation: { amount, identifier, inbound: false, operationId: operation_id, paidAtUnix: now, type, network_fee, service_fee } }))
    return openNotification("top", "Success", "Successfully paid.");
  }

  const payLNAddress = async () => {
    try {
      const payLink = "https://" + to.split("@")[1] + "/.well-known/lnurlp/" + to.split("@")[0];
      const res = await axios.get(payLink);
      const callbackURL = await axios.get(
        res.data.callback + (res.data.callback.includes('?') ? "&" : "?") + "amount=" + (amount === 0 ? res.data.minSendable : amount * 1000),
        {
          headers: {
            'Content-Type': 'application/json',
            withCredentials: false,
          }
        }
      );
      console.log(callbackURL);

      if (callbackURL.data.success === false) {
        return openNotification("top", "Error", callbackURL.data.error);
      }
      const client = await getNostrClient(selectedSource.pasteField)

      const payRes = await (await getNostrClient(selectedSource.pasteField)).PayInvoice({
        invoice: callbackURL.data.pr,
        amount: +amount,
      })
      if (payRes.status == "OK") {
        dispatch(addAddressbookLink({
          identifier: callbackURL.data.pr,
          address: to
        }))
        return paymentSuccess(+amount, callbackURL.data.pr, Types.UserOperationType.OUTGOING_INVOICE, payRes)
      } else {
        return openNotification("top", "Error", payRes.reason);
      }
    } catch (error) {
      console.log(error)
      return openNotification("top", "Error", "Couldn't send using this info.");
    }
  }

  const payUsingNprofile = async () => {
    const expression: RegExp = /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i;
    let dst = to.toLowerCase()
    if (dst.startsWith("lightning:")) {
      dst = dst.slice("lightning:".length)
    }
    if (dst.startsWith("bitcoin:")) {
      dst = dst.slice("bitcoin:".length)
    }
    if (expression.test(dst)) {
      await payLNAddress()
      return
    }
    if (dst.startsWith("lnbc")) {
      try {
        const result = await (await getNostrClient(selectedSource.pasteField)).DecodeInvoice({ invoice: dst });
        if (result.status != "OK") {
          return;
        }
        const payRes = await (await getNostrClient(selectedSource.pasteField)).PayInvoice({
          invoice: dst,
          amount: +amount,
        })
        if (payRes.status == "OK") {
          return paymentSuccess(result.amount, dst, Types.UserOperationType.OUTGOING_INVOICE, payRes)
        } else {
          return openNotification("top", "Error", payRes.reason);
        }
      } catch (error) {
        console.log(error);
        return openNotification("top", "Error", "Couldn't send using this info.");
      }
    }
    if (validate(dst)) {
      try {
        const payRes = await (await getNostrClient(selectedSource.pasteField)).PayAddress({
          address: dst,
          amoutSats: +amount,
          satsPerVByte: satsPerByte
        })
        if (payRes.status == "OK") {
          return paymentSuccess(+amount, dst, Types.UserOperationType.OUTGOING_TX, payRes)
        } else {
          return openNotification("top", "Error", payRes.reason);
        }
      } catch (error) {
        console.log(error)
        return openNotification("top", "Error", "Couldn't send using this info.");
      }
    }
  }

  const decodeInvoice = async (input: string) => {
    if (input.startsWith("lightning:")) {
      input = input.slice("lightning:".length)
    }
    if (!input.startsWith("lnbc")) {
      return null
    }
    try {
      const result = await (await getNostrClient(selectedSource.pasteField)).DecodeInvoice({ invoice: input });
      return result.status === "OK" ? result.amount : null
    } catch (error) {
      return null
    }
  }
  const validateAddress = async (input: string) => {
    if (input.startsWith("bitcoin:")) {
      input = input.slice("bitcoin:".length)
    }
    try {
      return validate(input)
    } catch (error) {
      return false
    }
  }

  const onChangeTo = async (e: string) => {
    setTo(e);
    let input = e.toLowerCase()
    const decodedAmount = await decodeInvoice(input)
    if (decodedAmount !== null) {
      setDecodedAmount(decodedAmount)
      return
    }
    if (await validateAddress(input)) {
      updateSatsPerByte()
    }
  }

  const confirmContent = <React.Fragment>
    <div className="Sources_notify">
      <div className="Sources_notify_title">Amount to Receive</div>
      <button className="Sources_notify_button" onClick={toggle}>OK</button>
    </div>
  </React.Fragment>;

  return (
    <div className='Send_container'>
      <div className='Send_loading' style={{ display: loading }}>
        <div className='Send_img'>
          {Icons.Animation()}
          <p>Sending</p>
        </div>
      </div>
      {contextHolder}
      <div className="Send" style={{ opacity: vReceive, zIndex: vReceive ? 1000 : -1 }}>
        <div className="Send_header_text">Send Payment</div>
        <div className="Send_config">
          {!!satsPerByte && <> <input type="number" name="sats_per_byte" value={satsPerByte} onChange={e => setSatsPerByte(+e.target.value)} /> sats per byte</>}
          <div className="Send_amount">
            Amount:
            <div className='Send_amount_container'>
              <input className="Send_amount_input" type="number" value={decodedAmount || amount} readOnly={decodedAmount !== 0} onChange={(e) => { setAmount(+e.target.value) }} />
              <button onClick={() => { setAmountAssets(amountAssets === "BTC" ? "sats" : "BTC") }}>{amountAssets}</button>
            </div>
          </div>
          <div className='Send_available_amount'>
            ~ ${amount === 0 ? 0 : (amount * price.buyPrice * (amountAssets === "BTC" ? 1 : 0.00000001)).toFixed(2)}
          </div>
          <div className="Send_to">
            <p>To:</p>
            <input type="text" placeholder="Invoice, Bitcoin or Lightning Address, nPub, Email" value={to} onChange={(e) => { onChangeTo(e.target.value) }} />
          </div>
          <div className="Send_for">
            <p>For:</p>
            <input type="text" placeholder="Add a note" value={note} onChange={(e) => { setNote(e.target.value) }} />
          </div>
          <div className="Send_from">
            <p>Spend From:</p>
            <SpendFromDropdown values={spendSources} initialValue={spendSources[0]} callback={setSelectedSource} />
          </div>
        </div>
      </div>
      <div className="Send_other_options">
        <div className="Send_lnurl">
          <div className="Send_set_amount_copy">
            <button onClick={() => { router.goBack() }}>{Icons.Close()}CANCEL</button>
          </div>
        </div>
        <div className="Send_chain">
          <div className="Send_set_amount_copy">
            <button onClick={handleSubmit}>{Icons.send()}SEND</button>
          </div>
        </div>
      </div>
      <Modal isShown={isShown} hide={toggle} modalContent={confirmContent} headerText={''} />
    </div>
  )
}