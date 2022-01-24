import React from "react";
import styled, { css } from "styled-components";
import { Device } from "assets/Device";

import { toast as toaster } from "react-toastify";
import "react-toastify/dist/ReactToastify.min.css";
import Loader from "react-loader-spinner";
import Skeleton from "@yisheng90/react-loading";
import { IoMdPeople } from "react-icons/io";
import { GoVerified } from "react-icons/go";
import { FaRegAddressCard } from "react-icons/fa";
import { AiTwotoneCopy } from "react-icons/ai";
import { useWeb3React } from "@web3-react/core";
import { useDispatch, useSelector } from "react-redux";

import { postReq } from "api";
import NotificationToast from "components/NotificationToast";
import ChannelsDataStore from "singletons/ChannelsDataStore";
import { cacheChannelInfo } from "redux/slices/channelSlice";

// Create Header
function ViewChannelItem({ channelObjectProp }) {
  const dispatch = useDispatch();
  const {
    epnsReadProvider,
    epnsWriteProvider,
    epnsCommReadProvider,
    pushAdminAddress,
    ZERO_ADDRESS,
  } = useSelector((state) => state.contracts);
  const { canVerify } = useSelector((state) => state.admin);
  const { channelsCache, CHANNEL_BLACKLIST } = useSelector(
    (state) => state.channels
  );
  const { account, library, chainId } = useWeb3React();
  const isOwner = channelObjectProp.addr === account;

  const [channelObject, setChannelObject] = React.useState({});
  const [channelJson, setChannelJson] = React.useState({});
  const [subscribed, setSubscribed] = React.useState(true);
  const [loading, setLoading] = React.useState(true);
  const [memberCount, setMemberCount] = React.useState(0);
  const [isPushAdmin, setIsPushAdmin] = React.useState(false);
  const [isVerified, setIsVerified] = React.useState(false);
  const [isBlocked, setIsBlocked] = React.useState(false);
  const [vLoading, setvLoading] = React.useState(false);
  const [bLoading, setBLoading] = React.useState(false);
  const [txInProgress, setTxInProgress] = React.useState(false);
  const [canUnverify, setCanUnverify] = React.useState(false);
  const [verifierDetails, setVerifierDetails] = React.useState(null);
  const [copyText, setCopyText] = React.useState(null);

  // ------ toast related section
  const isChannelBlacklisted = CHANNEL_BLACKLIST.includes(channelObject.addr);
  const [toast, showToast] = React.useState(null);
  const clearToast = () => showToast(null);

  //clear toast variable after it is shown
  React.useEffect(() => {
    if (toast) {
      clearToast();
    }
  }, [toast]);
  // ------ toast related section

  React.useEffect(() => {
    if (!channelObject.addr) return;
    if (channelObject.verifiedBy) {
      // procced as usual
      fetchChannelJson().catch((err) => alert(err.message));
      setIsBlocked(
        channelObject.channelState === 3 || channelObject.channelState === 2 //dont display channel if blocked //dont display channel if deactivated
      );
    } else {
      // if this key (verifiedBy) is not present it means we are searching and should fetch the channel object from chain again
      epnsReadProvider.channels(channelObject.addr).then((response) => {
        setChannelObject({ ...response, addr: channelObject.addr });
        fetchChannelJson();
      });
    }
  }, [account, channelObject, chainId]);

  React.useEffect(() => {
    if (!channelObjectProp) return;
    setChannelObject(channelObjectProp);
  }, [channelObjectProp]);

  React.useEffect(() => {
    if (!isVerified || channelObject?.verifiedBy === ZERO_ADDRESS) return;
    ChannelsDataStore.instance
      .getChannelJsonAsync(channelObject.verifiedBy)
      .then((verifierDetails) => {
        setVerifierDetails(verifierDetails);
      })
      .catch((err) => {
        console.log(channelObject.verifiedBy, err);
      });
  }, [isVerified, channelObject]);

  const EPNS_DOMAIN = {
    name: "EPNS COMM V1",
    chainId: chainId,
    verifyingContract: epnsCommReadProvider.address,
  };
  // to fetch channels
  const fetchChannelJson = async () => {
    try {
      let channelJson = {};
      setCopyText(channelObject.addr);
      if (channelsCache[channelObject.addr]) {
        channelJson = channelsCache[channelObject.addr];
      } else {
        channelJson = await ChannelsDataStore.instance.getChannelJsonAsync(
          channelObject.addr
        );
        dispatch(
          cacheChannelInfo({
            address: channelObject.addr,
            meta: channelJson,
          })
        );
      }
      const channelSubscribers = await postReq("/channels/get_subscribers", {
        channel: channelObject.addr,
        op: "read",
      })
        .then(({ data }) => {
          const subs = data.subscribers;

          return subs;
        })
        .catch((err) => {
          console.log(`getChannelSubscribers => ${err.message}`);
          return [];
        });
      const subscribed = channelSubscribers.find((sub) => {
        return sub.toLowerCase() === account.toLowerCase();
      });

      setIsPushAdmin(pushAdminAddress === account);
      setMemberCount(channelSubscribers.length);
      setSubscribed(subscribed);
      setChannelJson({ ...channelJson, addr: channelObject.addr });
      setLoading(false);
    } catch (err) {
      setIsBlocked(true);
    }
  };

  React.useEffect(() => {
    if(!channelObject) return;
    setIsVerified(
      Boolean(
        (channelObject.verifiedBy &&
          channelObject.verifiedBy !== ZERO_ADDRESS) ||
          channelObject.addr === pushAdminAddress
      )
    );
    setCanUnverify(channelObject.verifiedBy == account);
  }, [channelObject]);

  // toast customize
  const LoaderToast = ({ msg, color }) => (
    <Toaster>
      <Loader type="Oval" color={color} height={30} width={30} />
      <ToasterMsg>{msg}</ToasterMsg>
    </Toaster>
  );

  // to subscribe
  const subscribe = async () => {
    subscribeAction(false);
  };
  const formatAddress = (addressText) => {
    return addressText.length > 40
      ? `${addressText.slice(0, 4)}....${addressText.slice(36)}`
      : addressText;
  };

  // Toastify
  let notificationToast = () =>
    toaster.dark(<LoaderToast msg="Preparing Notification" color="#fff" />, {
      position: "bottom-right",
      autoClose: false,
      hideProgressBar: true,
      closeOnClick: true,
      pauseOnHover: true,
      draggable: true,
      progress: undefined,
    });

  const verifyChannel = () => {
    setvLoading(true);
    // post op
    epnsWriteProvider
      .verifyChannel(channelObject.addr)
      .then(async (tx) => {
        console.log(tx);
        console.log("Transaction Sent!");

        toaster.update(notificationToast(), {
          render: "Transaction sent",
          type: toaster.TYPE.INFO,
          autoClose: 5000,
        });

        await tx.wait(1);
        console.log ("Transaction Mined!");
        setIsVerified(true);
      })
      .catch((err) => {
        console.log("!!!Error verifyChannel() --> %o", err);
        toaster.update(notificationToast(), {
          render: "Transacion Failed: " + err.error?.message || "Unknown Error",
          type: toaster.TYPE.ERROR,
          autoClose: 5000,
        });
      })
      .finally(() => {
        setvLoading(false);
      });
  };

  const unverifyChannel = () => {
    setvLoading(true);
    epnsWriteProvider
      .unverifyChannel(channelObject.addr)
      .then(async (tx) => {
        console.log(tx);
        console.log("Transaction Sent!");

        toaster.update(notificationToast(), {
          render: "Transaction sent",
          type: toaster.TYPE.INFO,
          autoClose: 5000,
        });

        await tx.wait(1);
        console.log("Transaction Mined!");
        setIsVerified(false);
      })
      .catch((err) => {
        console.log("!!!Error handleSendMessage() --> %o", err);
        toaster.update(notificationToast(), {
          render: "Transacion Failed: " + err.error?.message || "Unknown Error",
          type: toaster.TYPE.ERROR,
          autoClose: 5000,
        });
      });
    setvLoading(false);
  };
  const blockChannel = () => {
    setBLoading(true);
    epnsWriteProvider
      .blockChannel(channelObject.addr)
      .then(async (tx) => {
        console.log(tx);
        console.log("Transaction Sent!");

        toaster.update(notificationToast(), {
          render: "Transaction Sent",
          type: toaster.TYPE.INFO,
          autoClose: 5000,
        });

        // await tx.wait(1);
        // console.log ("Transaction Mined!");
      })
      .catch((err) => {
        console.log("!!!Error handleSendMessage() --> %o", err);
        toaster.update(notificationToast(), {
          render: "Transacion Failed: " + err.error.message,
          type: toaster.TYPE.ERROR,
          autoClose: 5000,
        });
      })
      .finally(() => {
        // post op
        setBLoading(false);
        setIsBlocked(true);
      });
  };

  const subscribeAction = async () => {
    setTxInProgress(true);
    let txToast;
    try {
      const type = {
        Subscribe: [
          { name: "channel", type: "address" },
          { name: "subscriber", type: "address" },
          { name: "action", type: "string" },
        ],
      };
      const message = {
        channel: channelObject.addr,
        subscriber: account,
        action: "Subscribe",
      };

      const signature = await library
        .getSigner(account)
        ._signTypedData(EPNS_DOMAIN, type, message);
      txToast = toaster.dark(
        <LoaderToast msg="Waiting for Confirmation..." color="#35c5f3" />,
        {
          position: "bottom-right",
          autoClose: false,
          hideProgressBar: true,
          closeOnClick: true,
          pauseOnHover: true,
          draggable: true,
          progress: undefined,
        }
      );

      postReq("/channels/subscribe_offchain", {
        signature,
        message,
        op: "write",
        chainId,
        contractAddress: epnsCommReadProvider.address,
      }).then((res) => {
        setSubscribed(true);
        setMemberCount(memberCount + 1);
        toaster.update(txToast, {
          render: "Successfully opted into channel !",
          type: toaster.TYPE.SUCCESS,
          autoClose: 5000,
        });
        console.log(res);
        setTxInProgress(false);
      });
    } catch (err) {
      toaster.update(txToast, {
        render: "There was an error opting into channel (" + err.message + ")",
        type: toaster.TYPE.ERROR,
        autoClose: 5000,
      });
      console.log(err);
    } finally {
      setTxInProgress(false);
    }
  };

  const copyToClipboard = (url) => {
    // fallback for non navigator browser support
    if (navigator && navigator.clipboard) {
      navigator.clipboard.writeText(url);
    } else {
      const el = document.createElement("textarea");
      el.value = url;
      document.body.appendChild(el);
      el.select();
      document.execCommand("copy");
      document.body.removeChild(el);
    }
  };

  const unsubscribeAction = async () => {
    let txToast;
    try {
      const type = {
        Unsubscribe: [
          { name: "channel", type: "address" },
          { name: "unsubscriber", type: "address" },
          { name: "action", type: "string" },
        ],
      };
      const message = {
        channel: channelObject.addr,
        unsubscriber: account,
        action: "Unsubscribe",
      };
      const signature = await library
        .getSigner(account)
        ._signTypedData(EPNS_DOMAIN, type, message);

      txToast = toaster.dark(
        <LoaderToast msg="Waiting for Confirmation..." color="#35c5f3" />,
        {
          position: "bottom-right",
          autoClose: false,
          hideProgressBar: true,
          closeOnClick: true,
          pauseOnHover: true,
          draggable: true,
          progress: undefined,
        }
      );

      postReq("/channels/unsubscribe_offchain", {
        signature,
        message,
        op: "write",
        chainId,
        contractAddress: epnsCommReadProvider.address,
      })
        .then((res) => {
          setSubscribed(false);
          setMemberCount(memberCount - 1);
          toaster.update(txToast, {
            render: "Successfully opted out of channel !",
            type: toaster.TYPE.SUCCESS,
            autoClose: 5000,
          });
          console.log(res);
        })
        .catch((err) => {
          toaster.update(txToast, {
            render:
              "There was an error opting into channel (" + err.message + ")",
            type: toaster.TYPE.ERROR,
            autoClose: 5000,
          });
          console.log(err);
        })
        .finally(() => {
          setTxInProgress(false);
        });
    } finally {
      setTxInProgress(false);
    }
  };

  if (isBlocked) return <></>;
  if (isChannelBlacklisted) return <></>;

  // render
  return (
    <Container key={channelObject.addr}>
      <ChannelLogo>
        <ChannelLogoOuter>
          <ChannelLogoInner>
            {loading ? (
              <Skeleton color="#eee" height="100%" />
            ) : (
              <ChannelLogoImg src={`${channelJson.icon}`} />
            )}
          </ChannelLogoInner>
        </ChannelLogoOuter>
      </ChannelLogo>

      <ChannelInfo>
        <ChannelTitle>
          {loading ? (
            <Skeleton color="#eee" width="50%" height={24} />
          ) : (
            <ChannelTitleLink
              href={channelJson.url}
              target="_blank"
              rel="nofollow"
            >
              {channelJson.name}
              {isVerified && (
                <Subscribers style={{ display: "inline", marginLeft: "8px" }}>
                  <GoVerified size={18} color="#35c4f3" />
                </Subscribers>
              )}
            </ChannelTitleLink>
          )}
        </ChannelTitle>

        <ChannelDesc>
          {loading ? (
            <>
              <SkeletonWrapper atH={5} atW={100}>
                <Skeleton color="#eee" width="100%" height={5} />
              </SkeletonWrapper>

              <SkeletonWrapper atH={5} atW={100}>
                <Skeleton color="#eee" width="100%" height={5} />
              </SkeletonWrapper>

              <SkeletonWrapper atH={5} atW={100}>
                <Skeleton color="#eee" width="40%" height={5} />
              </SkeletonWrapper>
            </>
          ) : (
            <ChannelDescLabel>{channelJson.info}</ChannelDescLabel>
          )}
        </ChannelDesc>

        <ChannelMeta>
          {loading ? (
            <>
              <SkeletonWrapper atH={10} atW={30} marginBottom="0">
                <Skeleton />
              </SkeletonWrapper>
            </>
          ) : (
            <ColumnFlex>
              <FlexBox style={{ marginBottom: "10px" }}>
                <Subscribers>
                  <IoMdPeople size={20} color="#ccc" />
                  <SubscribersCount>{memberCount?.toLocaleString()}</SubscribersCount>
                </Subscribers>

                <Subscribers style={{ marginLeft: "10px" }}>
                  <FaRegAddressCard size={20} color="#ccc" />
                  <SubscribersCount
                    onClick={() => {
                      copyToClipboard(channelJson.addr);
                      setCopyText("copied");
                    }}
                    onMouseEnter={() => {
                      setCopyText("click to copy");
                    }}
                    onMouseLeave={() => {
                      setCopyText(channelJson.addr);
                    }}
                    style={{ cursor: "pointer" }}
                  >
                    <AiTwotoneCopy />
                    {formatAddress(copyText)}
                  </SubscribersCount>
                </Subscribers>
              </FlexBox>
              {verifierDetails && (
                <Subscribers>
                  <VerifiedBy>Verified by:</VerifiedBy>
                  <VerifierIcon src={verifierDetails.icon} />
                  <VerifierName>{verifierDetails.name}</VerifierName>
                </Subscribers>
              )}
            </ColumnFlex>
          )}
        </ChannelMeta>
      </ChannelInfo>
      {!!account && !!library && (
        <>
          <LineBreak />
          <ChannelActions>
            {loading && (
              <SkeletonButton>
                <Skeleton />
              </SkeletonButton>
            )}
            {!loading && isPushAdmin && (
              <SubscribeButton onClick={blockChannel} disabled={bLoading}>
                {bLoading && (
                  <ActionLoader>
                    <Loader type="Oval" color="#FFF" height={16} width={16} />
                  </ActionLoader>
                )}
                <ActionTitle hideit={bLoading}>Block channel</ActionTitle>
              </SubscribeButton>
            )}
            {!loading && (isPushAdmin || canVerify) && !isVerified && (
              <SubscribeButton onClick={verifyChannel} disabled={vLoading}>
                {vLoading && (
                  <ActionLoader>
                    <Loader type="Oval" color="#FFF" height={16} width={16} />
                  </ActionLoader>
                )}
                <ActionTitle hideit={vLoading}>Verify Channel</ActionTitle>
              </SubscribeButton>
            )}
            {!loading && (isPushAdmin || canUnverify) && isVerified && (
              <UnsubscribeButton onClick={unverifyChannel} disabled={vLoading}>
                {vLoading && (
                  <ActionLoader>
                    <Loader type="Oval" color="#FFF" height={16} width={16} />
                  </ActionLoader>
                )}
                <ActionTitle hideit={vLoading}>Unverify Channel</ActionTitle>
              </UnsubscribeButton>
            )}
            {!loading && !subscribed && (
              <SubscribeButton onClick={subscribe} disabled={txInProgress}>
                {txInProgress && (
                  <ActionLoader>
                    <Loader type="Oval" color="#FFF" height={16} width={16} />
                  </ActionLoader>
                )}
                <ActionTitle hideit={txInProgress}>Opt-In</ActionTitle>
              </SubscribeButton>
            )}
            {!loading && subscribed && (
              <>
                {isOwner && <OwnerButton disabled>Owner</OwnerButton>}
                {!isOwner && (
                  <UnsubscribeButton
                    onClick={unsubscribeAction}
                    disabled={txInProgress}
                  >
                    {txInProgress && (
                      <ActionLoader>
                        <Loader
                          type="Oval"
                          color="#FFF"
                          height={16}
                          width={16}
                        />
                      </ActionLoader>
                    )}
                    <ActionTitle hideit={txInProgress}>Opt-Out</ActionTitle>
                  </UnsubscribeButton>
                )}
              </>
            )}
          </ChannelActions>
        </>
      )}
      {toast && (
        <NotificationToast notification={toast} clearToast={clearToast} />
      )}
    </Container>
  );
}

const FlexBox = styled.div`
  display: flex;
`;

const ColumnFlex = styled(FlexBox)`
  flex-direction: column;
`;
// css styles
const Container = styled.div`
  flex: 1;
  display: flex;
  flex-wrap: wrap;

  background: #fff;
  border-radius: 10px;
  border: 1px solid rgb(237, 237, 237);

  margin: 15px 0px;
  justify-content: center;
  padding: 20px 10px;
`;

const SkeletonWrapper = styled.div`
  overflow: hidden;
  width: ${(props) => props.atW + "%" || "100%"};
  height: ${(props) => props.atH}px;
  border-radius: ${(props) => props.borderRadius || 10}px;
  margin-bottom: ${(props) => props.marginBottom || 5}px;
  margin-right: ${(props) => props.marginRight || 0}px;
`;

const ChannelLogo = styled.div`
  max-width: 100px;
  min-width: 32px;
  flex: 1;
  margin: 5px;
  padding: 10px;
  border: 2px solid #fafafa;
  overflow: hidden;
  border-radius: 20px;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-self: flex-start;
`;

const ChannelLogoOuter = styled.div`
  padding-top: 100%;
  position: relative;
`;

const ChannelLogoInner = styled.div`
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  overflow: hidden;
  border-radius: 20px;
  display: flex;
  justify-content: center;
  align-items: center;
`;

const ChannelLogoImg = styled.img`
  object-fit: contain;
  width: 100%;
  border-radius: 20px;
  overflow: hidden;
`;

const ChannelInfo = styled.div`
  flex: 1;
  margin: 5px 10px;
  min-width: 120px;
  flex-grow: 4;
  flex-direction: column;
  display: flex;
`;

const ChannelTitle = styled.div`
  margin-bottom: 5px;
`;

const ChannelTitleLink = styled.a`
  text-decoration: none;
  font-weight: 600;
  color: #e20880;
  font-size: 20px;
  &:hover {
    text-decoration: underline;
    cursor: pointer;
    pointer: hand;
  }
`;

const VerifiedBy = styled.span`
  color: #ec008c;
  font-size: 16px;
  line-height: 20px;
  letter-spacing: 0.05em;
  font-weight: 600;
  display: inline-block;
`;

const VerifierIcon = styled.img`
  width: 20px;
  height: 20px;
  border-radius: 50%;
  margin-left: 6px;
  margin-right: 4px;
`;
const VerifierName = styled.span`
  font-weight: 400;
  color: black;
  font-size: 16px;
  letter-spacing: 0em;
`;

const ChannelDesc = styled.div`
  flex: 1;
  display: flex;
  font-size: 14px;
  color: rgba(0, 0, 0, 0.75);
  font-weight: 400;
  flex-direction: column;
  margin-bottom: 30px
`;

const ChannelDescLabel = styled.label`
  flex: 1;
`;

const ChannelMeta = styled.div`
  display: flex;
  flex-wrap: wrap;
  flex-direction: row;
  font-size: 13px;
`;

const ChannelMetaBox = styled.label`
  margin: 0px 5px;
  color: #fff;
  font-weight: 600;
  padding: 5px 10px;
  display: flex;
  border-radius: 10px;
  font-size: 11px;
  gap: 3px;
`;

const Subscribers = styled.div`
  display: flex;
  flex-wrap: wrap;
  flex-direction: row;
  align-items: center;
`;

const SubscribersCount = styled(ChannelMetaBox)`
  background: #35c4f3;
  transition: 300ms;
`;

const Pool = styled.div`
  margin: 0px 10px;
  display: flex;
  flex-direction: row;
  align-items: center;
`;

const PoolShare = styled(ChannelMetaBox)`
  background: #674c9f;
`;

const LineBreak = styled.div`
  display: none;
  flex-basis: 100%;
  height: 0;

  @media ${Device.tablet} {
    display: block;
  }
`;

const ChannelActions = styled.div`
  margin: 5px;
  flex-grow: 1;
  // max-width: 250px;
  display: flex;
  justify-content: flex-end;
  // justify-content: center;
  align-items: center;
`;

const ChannelActionButton = styled.button`
  border: 0;
  outline: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 8px 15px;
  margin: 10px;
  color: #fff;
  border-radius: 5px;
  font-size: 14px;
  font-weight: 400;
  position: relative;
  &:hover {
    opacity: 0.9;
    cursor: pointer;
    pointer: hand;
  }
  &:active {
    opacity: 0.75;
    cursor: pointer;
    pointer: hand;
  }
  ${(props) =>
    props.disabled &&
    css`
      &:hover {
        opacity: 1;
        cursor: default;
        pointer: default;
      }
      &:active {
        opacity: 1;
        cursor: default;
        pointer: default;
      }
    `}
`;

const ActionTitle = styled.span`
  ${(props) =>
    props.hideit &&
    css`
      visibility: hidden;
    `};
`;

const ActionLoader = styled.div`
  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;
  right: 0;
  display: flex;
  justify-content: center;
  align-items: center;
`;

const SkeletonButton = styled.div`
  border: 0;
  outline: 0;
  height: 30px;
  display: flex;
  align-items: center;
  justify-content: center;
  margin: 10px;
  border-radius: 5px;
  flex: 1;
`;

const SubscribeButton = styled(ChannelActionButton)`
  background: #e20880;
  min-width: 80px;
`;

const UnsubscribeButton = styled(ChannelActionButton)`
  background: #674c9f;
  min-width: 80px;
`;

const OwnerButton = styled(ChannelActionButton)`
  background: #35c5f3;
`;

const Toaster = styled.div`
  display: flex;
  flex-direction: row;
  align-items: center;
  margin: 0px 10px;
`;

const ToasterMsg = styled.div`
  margin: 0px 10px;
`;

// Export Default
export default ViewChannelItem;
