import { useEffect } from "react";
import { useIonRouter } from '@ionic/react';
import { setNostrPrivateKey } from "../../Api/nostr";
import { DEFAULT_BRIDGE_URL, NOSTR_PRIVATE_KEY_STORAGE_KEY, NOSTR_PUB_DESTINATION, NOSTR_RELAYS, options } from "../../constants";
import { useDispatch, useSelector } from "../../State/store";
import { addPaySources } from "../../State/Slices/paySourcesSlice";
import { addSpendSources } from "../../State/Slices/spendSourcesSlice";
import { encodeNprofile } from "../../custom-nip19";

export const NodeUp = () => {
  const router = useIonRouter();

  const privateKey = localStorage.getItem(NOSTR_PRIVATE_KEY_STORAGE_KEY);
  const dispatch = useDispatch();
  const paySources = useSelector((state) => state.spendSource);
  const spendSources = useSelector((state) => state.spendSource);
  const toMainPage = () => {
    setPrivateKey();
    addBootStrapSources();
    if (privateKey) {
      router.push("/home");
    } else {
      router.push("/loader")
    }
  };

  const toSourcePage = () => {
    setPrivateKey()
    router.push("/sources")
  };

  const toRecoverPage = () => {
    setPrivateKey()
    router.push("/auth")
  }

  useEffect(() => {
    if (privateKey) {
      router.push("/home")
    }
  }, [router, privateKey]);

  const setPrivateKey = () => {
    setNostrPrivateKey();
  }


  const addBootStrapSources = async () => {
    if (paySources.length != 0 && spendSources.length != 0) {
      return;
    } else {
      const bootstrapBalance = "0";
      const nprofile = encodeNprofile({
        pubkey: NOSTR_PUB_DESTINATION,
        relays: NOSTR_RELAYS,
        bridge: [DEFAULT_BRIDGE_URL]
      })

      dispatch(addPaySources(
        {
          id: 0,
          label: "Bootstrap Node",
          pasteField: nprofile,
          option: options.little,
          icon: "0",
        }
      ));
      dispatch(addSpendSources(
        {
          id: 0,
          label: "Bootstrap Node",
          pasteField: nprofile,
          option: options.little,
          icon: "0",
          balance: bootstrapBalance,
        }
      ))
    }
  }

  return (
    <div className="NodeUp">
      <div className="NodeUp_title">Node Up</div>
      <div className="NodeUp_textBox">
        &quot;Continue&quot; to bootstrap the wallet with a trusted server and add a node later<br /><br /><br />
        &quot;Add connection&quot; to link a node now.
      </div>
      <div className="NodeUp_manual">
        <div className="NodeUp_manual_btn">
          <button onClick={toMainPage} id="continue-button">
            Continue
          </button>
        </div>
        <div className="NodeUp_manual_text">
          <div onClick={toSourcePage}>
            Add Connection
          </div>
          <span>|</span>
          <div onClick={toRecoverPage}>
            Recover Backup
          </div>
        </div>
      </div>
      <div className="NodeUp_terms">
        By proceeding you acknowledge that this is bleeding-edge software, and agree to the providers <a href="https://docs.shock.network/terms/" target="_blank" rel="noreferrer">terms</a> regarding any services herein.
      </div>
    </div>
  )
}