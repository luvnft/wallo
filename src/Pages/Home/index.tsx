import { useEffect, useMemo, useState } from "react";

import { useSelector } from "../../State/store";
import { SwItem } from "../../Components/SwItem";
import * as Types from "../../Api/autogenerated/ts/types"

export type TransactionInfo = Types.UserOperation & { source: string };
export const Home = () => {
  const price = useSelector((state) => state.usdToBTC);
  const spendSources = useSelector((state) => state.spendSource);
  console.log(spendSources, 'asdfasdfasdf444444444444444444')
  const operationGroups = useSelector(({ history }) => history.operations) || {}
  const operationsUpdateHook = useSelector(({ history }) => history.operationsUpdateHook) || 0

  const [balance, setBalance] = useState('0.00')
  const [money, setMoney] = useState("0")

  const [transactions, setTransactions] = useState<TransactionInfo[]>([]);

  let openAppFlag = true; 

  const dumyDat = {
    paidAtUnix: 1,
    type: {
      INCOMING_TX :'INCOMING_TX',
      OUTGOING_TX : 'OUTGOING_TX',
      INCOMING_INVOICE: 'INCOMING_INVOICE',
      OUTGOING_INVOICE: 'OUTGOING_INVOICE',
      OUTGOING_USER_TO_USER: 'OUTGOING_USER_TO_USER',
      INCOMING_USER_TO_USER: 'INCOMING_USER_TO_USER',
    },
    inbound: true,
    amount: 10,
    identifier: 'string',
    operationId: 'string',
    service_fee: 10,
    network_fee: 44,
    confirmed: true,
    source: '22'
  }
  useEffect(() => {
    if (!operationGroups) {
      return
    }
    const populatedEntries = Object.entries(operationGroups).filter(([,operations]) => operations.length > 0);
    if (populatedEntries.length === 0) {
      console.log("No operations to display");
      return;
    }

    const collapsed: (Types.UserOperation & { source: string })[] = []
    populatedEntries.forEach(([source, operations]) => {
      if (operations) collapsed.push(...operations.map(o => ({ ...o, source })))
    })
    console.log("collpased:", collapsed)
    collapsed.sort((a, b) => b.paidAtUnix - a.paidAtUnix);
    setTransactions(collapsed);
    /* let totalPending = 0
    setSwItemArray(collapsed.map((o, i) => {
      let label = getIdentifierLink(addressbook, o.identifier);
      if (label === o.identifier && o.type === Types.UserOperationType.INCOMING_INVOICE) {
        const decodedInvoice = decode(o.identifier);
        const description = decodedInvoice.sections.find(section => section.name === "description");
        if (description) {
          label = description.value;
        }
      }
      if (o.type === Types.UserOperationType.INCOMING_TX && !o.confirmed) {
        totalPending += o.amount
      }
      return {
        priceImg: o.inbound ? Icons.PriceUp : Icons.PriceDown,
        station: label.length < 30 ? label : `${label.substring(0, 9)}...${label.substring(label.length - 9, label.length)}`,
        changes: `${o.inbound ? "" : "-"}${o.amount}`,
        date: o.confirmed! ? "Pending" : moment(o.paidAtUnix * 1000).fromNow(),
        price: Math.round(100 * o.amount * price.sellPrice / (100 * 1000 * 1000)) / 100,
        stateIcon: 'lightning',
        underline: i !== collapsed.length - 1
      }
    }) || [])
    setOnTheWay(totalPending) */
   
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [operationsUpdateHook]);

  useEffect(() => {
    let totalAmount = 0;
    for (let i = 0; i < spendSources.length; i++) {
      const eachAmount = spendSources[i].balance;
      totalAmount += parseInt(eachAmount);
    }
    setBalance(totalAmount.toString());
    setMoney(totalAmount == 0 ? "0" : (totalAmount * price.buyPrice * 0.00000001).toFixed(2))
  }, [spendSources, price]);

  const transactionsToRender = useMemo(() => {
    return transactions.map((o, i) => {
      return <SwItem operation={o} key={o.operationId} underline={i !== transactions.length - 1}/>
    })
  }, [transactions])

  useEffect(() => {
    
    if(openAppFlag){
      openAppFlag = !openAppFlag;
      setTimeout(() => {
        // const confirmBox = window.confirm(
        //   "Do you want to open App?"
        // )
        // if (confirmBox === true) {
        //   window.open('shockwallet://open', '_blank');
        // }
      }, 1500);
    }
  }, [])

  return (
    <div className="Home">
      <div className="Home_sats">
        {/* {!!onTheWay && <p>{onTheWay} sats are on the way!</p>} */}
        <div className="Home_sats_amount">{balance}</div>
        <div className="Home_sats_name">sats</div>
        <div className="Home_sats_changes">~ ${money}</div>
      </div>
      <div className="Home_scroller scroller">
        <div className="Home_content">
        <SwItem operation={dumyDat} underline={true}/>
          {/* {transactionsToRender} */}
        </div>
      </div>
    </div>
  )
}
