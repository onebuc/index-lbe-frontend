/* global contracts, ethereum, provider */

import React from "react";
import Web3 from "web3";
import { ToastContainer, toast } from "react-toastify";
import {
  contracts_mainnet,
  contracts_testnet,
} from "../contracts/";
import {
  Skeleton,
} from "./components/";
import {
  applyDecimals,
  max_uint,
  removeDecimals,
  toBigNumber,
} from "../utils/";
import styles from "./styles.module.css";

class App extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      amount_index: 0,
      amount_mim: 0,
      account: undefined,
      initialized_amount: false,
      loading: true,
      sale_data: {},
      testnet: false,
      transactions: [],
    }
    // Event handlers
    this.handleBlur = this.handleBlur.bind(this);
    this.handleChange = this.handleChange.bind(this);
    // Wallet interactions
    this.addIndexToWallet = this.addIndexToWallet.bind(this);
    this.connectWallet = this.connectWallet.bind(this);
    // Contract data fetchers
    this.fetchAllowance = this.fetchAllowance.bind(this);
    this.fetchMimBalance = this.fetchMimBalance.bind(this);
    this.fetchSaleData = this.fetchSaleData.bind(this);
    // Contract interactions
    this.approve = this.approve.bind(this);
    this.claim = this.claim.bind(this);
    this.deposit = this.deposit.bind(this);
    this.sendTransaction = this.sendTransaction.bind(this);
    // Helpers
    this.canClaim = this.canClaim.bind(this);
    this.canInvest = this.canInvest.bind(this);
    this.isSoldOut = this.isSoldOut.bind(this);
  }

  // ============================ Initialization ============================ //
  componentDidMount() {
    if (window.ethereum) {
      window.provider = new Web3(window.ethereum);

      setTimeout(() => {
        window.contracts = this.state.testnet ? contracts_testnet : contracts_mainnet;

        contracts.mim.contract = new provider.eth.Contract(contracts.mim.abi, contracts.mim.address)
        contracts.indexsale.contract = new provider.eth.Contract(contracts.indexsale.abi, contracts.indexsale.address)

        this.connectWallet()

        ethereum.on("accountsChanged", this.connectWallet);
      }, 1000);
    }
  }

  // ============================ Event handlers ============================ //
  handleBlur(event) {
    if (
      event.target.value === "" ||
      event.target.value < 0
    ) {
      this.setState({
        "amount_index": 0,
        "amount_mim": 0,
      });
    } else {
      if (
        this.state.sale_data.is_private_sale &&
        event.target.value > this.state.sale_data.max_private_sale_per_account * this.state.sale_data.price_in_mim
      ) {
        this.setState({
          amount_index: this.state.sale_data.max_private_sale_per_account,
          amount_mim: this.state.sale_data.max_private_sale_per_account * this.state.sale_data.price_in_mim,
        });
      } else if (
        this.state.sale_data.is_public_sale &&
        event.target.value > this.state.sale_data.max_public_sale_per_account * this.state.sale_data.price_in_mim
      ) {
        this.setState({
          amount_index: this.state.sale_data.max_public_sale_per_account,
          amount_mim: this.state.sale_data.max_public_sale_per_account * this.state.sale_data.price_in_mim,
        });
      } else {
        this.setState({ amount_index: event.target.value / this.state.sale_data.price_in_mim });
      }
    }
  }

  handleChange(event) {
    if (
      event.target.value !== "" &&
      event.target.value > 0
    ) {
      this.setState({
        amount_index: event.target.value / this.state.sale_data.price_in_mim,
        amount_mim: event.target.value,
      });
    } else {
      this.setState({ amount_mim: event.target.value });
    }
  }

  // ========================= Wallet interactions ========================= //
  async addIndexToWallet() {
    try {
      ethereum.request({
        method: "wallet_watchAsset",
        params: {
          type: "ERC20",
          options: {
            address: contracts.index.address,
            symbol: contracts.index.symbol,
            decimals: contracts.index.decimals,
            image: contracts.index.image,
          },
        },
      });
    } catch (error) {
      console.log(error);
      toast.error(`Failed to add INDEX to wallet: ${error.message}`, { autoClose: 15000 });
    }
  }

  async connectWallet() {
    this.setState({ loading: true });

    const chain_id = await provider.eth.getChainId();
    const required_chain_id = this.state.testnet ? 43113 : 43114;

    if (chain_id !== required_chain_id) {
      ethereum.request({
        method: "wallet_addEthereumChain",
        params: [{
          chainId: this.state.testnet ? "0xA869" : "0xA86A",
          chainName: this.state.testnet ? "Avalanche Fuji Testnet" : "Avalanche Network",
          rpcUrls: [this.state.testnet ? "https://api.avax-test.network/ext/bc/C/rpc" : "https://api.avax.network/ext/bc/C/rpc"],
          nativeCurrency: {
            name: "AVAX",
            symbol: "AVAX",
            decimals: 18,
          },
          blockExplorerUrls: [this.state.testnet ? "https://testnet.snowtrace.io/" : "https://snowtrace.io/"],
        }],
      })
      .then(this.connectWallet)
      .catch(error => {
        console.log(error);
        this.setState({ loading: false });
      });
    } else {
      ethereum
      .request({ method: "eth_requestAccounts" })
      .then((accounts) => {
        this.setState({ account: accounts[0] });

        setTimeout(() => {
          Promise.all([
            this.fetchSaleData(),
            this.fetchMimBalance(),
          ])
          .then(() => {
            setInterval(() => {
              this.fetchSaleData();
              this.fetchMimBalance();
            }, 5000);

            this.fetchAllowance().then(() => this.setState({ loading: false }));
          });
        }, 2000);
      })
      .catch(error => {
        console.log(error);
        this.setState({ loading: false });
      });
    }
  }

  // ======================== Contract data fetchers ======================== //
  async fetchAllowance() {
    try {
      const buyableINDEX = toBigNumber(removeDecimals(this.state.sale_data.amount_buyable, contracts.index.decimals));
      const mustBeApproved = buyableINDEX.times(this.state.sale_data.price);
      const approved = await contracts.mim.contract.methods.allowance(this.state.account, this.state.sale_data.address).call();
      contracts.mim.approved = toBigNumber(approved).gte(mustBeApproved);
    } catch (error) {
      console.log(error);
    }
  }

  async fetchMimBalance() {
    if (this.state.account) {
      const value = await contracts.mim.contract.methods.balanceOf(this.state.account).call();
      contracts.mim.balance = applyDecimals(value, contracts.mim.decimals);
    }
  }

  async fetchSaleData() {
    return new Promise((resolve) => {
      if (this.state.account) {
        Promise.all([
          contracts.indexsale.contract.methods.privateSalePrice().call(),
          contracts.indexsale.contract.methods.MAX_PRIVATE_SALE_PER_ACCOUNT().call().then((value) => {
            return parseFloat(applyDecimals(value, contracts.index.decimals));
          }),
          contracts.indexsale.contract.methods.amountBuyable(this.state.account).call().then((value) => {
            return parseFloat(applyDecimals(value, contracts.index.decimals));
          })
          .catch(error => { return 200 }),
          contracts.indexsale.contract.methods.approvedBuyers(this.state.account).call(),
          contracts.indexsale.contract.methods.MAX_SOLD().call().then((max_sold) => {
            return parseFloat(applyDecimals(max_sold, contracts.index.decimals));
          }),
          contracts.indexsale.contract.methods.sold().call().then((sold) => {
            return parseFloat(applyDecimals(sold, contracts.index.decimals));
          }),
          contracts.indexsale.contract.methods.INDEX().call(),
          contracts.indexsale.contract.methods.invested(this.state.account).call().then((deposited) => {
            return parseFloat(applyDecimals(deposited, contracts.index.decimals));
          }),
          contracts.indexsale.contract.methods.publicSale().call(),
          contracts.indexsale.contract.methods.publicSalePrice().call(),
          contracts.indexsale.contract.methods.MAX_PUBLIC_SALE_PER_ACCOUNT().call().then((value) => {
            return parseFloat(applyDecimals(value, contracts.index.decimals));
          }),
          contracts.indexsale.contract.methods.isClaimable().call(),
        ])
        .then((data) => {
          const sale_data = {
            address: contracts.indexsale.address,
            amount_buyable: data[2],
            deposited: data[7] || 0,
            index_address: data[6],
            is_claim_period: data[11],
            is_closed: data[4] < 100000,
            is_private_sale: !data[8],
            is_public_sale: data[8],
            is_whitelisted: data[3],
            max_private_sale_per_account: data[1],
            max_public_sale_per_account: data[10],
            max_sold: data[4] < 100000 ? 100000 : data[4],
            price: data[8] ? data[9] : data[0],
            price_in_mim: data[8] ? (data[9] * (10 ** contracts.index.decimals) / (10 ** contracts.mim.decimals)) : (data[0] * (10 ** contracts.index.decimals) / (10 ** contracts.mim.decimals)),
            sold: data[5],
          };

          if (
            this.state.initialized_amount === false &&
            sale_data.is_private_sale &&
            sale_data.is_whitelisted
          ) {
            this.setState({
              amount_index: sale_data.max_private_sale_per_account,
              amount_mim: sale_data.max_private_sale_per_account * sale_data.price_in_mim,
              initialized_amount: true,
              sale_data: sale_data,
            });
          } else if (
            this.state.initialized_amount === false &&
            sale_data.is_public_sale &&
            !sale_data.is_whitelisted &&
            !sale_data.is_closed
          ) {
            this.setState({
              amount_index: sale_data.max_public_sale_per_account,
              amount_mim: sale_data.max_public_sale_per_account * sale_data.price_in_mim,
              initialized_amount: true,
              sale_data: sale_data,
            });
          } else {
            this.setState({ sale_data });
          }

          resolve();
        })
        .catch(error => {
          console.log(error);
          resolve();
        });
      } else {
        resolve();
      }
    });
  }

  // ======================== Contract interactions ======================== //
  approve() {
    this.sendTransaction(
      {
        from: this.state.account,
        to: contracts.mim.address,
        data: provider.eth.abi.encodeFunctionCall({
          name: "approve",
          type: "function",
          inputs: [{
            type: "address",
            name: "spender"
          }, {
            type: "uint256",
            name: "value"
          }]
        }, [contracts.indexsale.address, max_uint]),
      },
      "Approve MIM",
    );
  };

  async claim() {
    this.sendTransaction(
      {
        to: this.state.sale_data.address,
        data: provider.eth.abi.encodeFunctionSignature("claimINDEX()"),
      },
      "Claim aINDEX",
    );
  }

  deposit() {
    if (isNaN(parseFloat(this.state.amount_mim))) {
      toast.error("There was an error validating your investment amount. Please try again.", { autoClose: 15000 });
      return;
    } else if (parseFloat(this.state.amount_mim) === 0) {
      toast.error("You cannot invest 0 MIM", { autoClose: 15000 });
      return;
    } else if (parseFloat(this.state.amount_mim) > parseFloat(contracts.mim.balance)) {
      toast.error("Your MIM balance is less than the amount you are trying to invest", { autoClose: 15000 });
      return;
    } else if (
      (
        this.state.is_private_sale &&
        parseFloat(this.state.amount_mim) > this.state.sale_data.max_private_sale_per_account * this.state.sale_data.price_in_mim
      ) ||
      (
        this.state.is_public_sale &&
        parseFloat(this.state.amount_mim) > this.state.sale_data.max_public_sale_per_account * this.state.sale_data.price_in_mim
      )
    ) {
      toast.error("You cannot invest more than the maximum", { autoClose: 15000 });
      return;
    }

    const mim_to_deposit = toBigNumber(removeDecimals(this.state.amount_mim, contracts.mim.decimals))
    const index_to_deposit = mim_to_deposit.div(toBigNumber(this.state.sale_data.price)).toFixed(0)

    this.sendTransaction(
      {
        to: this.state.sale_data.address,
        data: provider.eth.abi.encodeFunctionCall({
          name: "buyINDEX",
          type: "function",
          inputs: [{
            type: "uint256",
            name: "amount"
          }]
        }, [index_to_deposit])
      },
      `Invest ${this.state.amount_mim} MIM`,
    )
    .then(() => this.setState({ amount: 0 }) );
  }

  async sendTransaction(params, name) {
    this.setState({ loading: true });

    params.from = this.state.account;

    return new Promise((resolve, reject) => {
      ethereum.request({
        method: "eth_sendTransaction",
        params: [params],
      })
      .then((tx_hash) => {
        toast.info("Transaction sent", { autoClose: 15000 });

        const transactions = this.state.transactions;
        transactions.unshift({
          hash: tx_hash,
          name: name,
        });
        this.setState({ transactions });

        const wait = () => {
          provider.eth.getTransaction(tx_hash).then((tx) => {
            if (tx?.blockNumber === null) {
              setTimeout(() => wait(), 1000);
              return;
            }

            try {
              this.fetchAllowance();
            } catch (error) {} // Ignore error

            this.setState({ loading: false });
            toast.success("Transaction successful!", { autoClose: 15000 });

            resolve(tx)
          })
        }

        wait();
      })
      .catch((error) => {
        this.setState({ loading: false });
        toast.error(`Transaction failed: ${error.message}`, { autoClose: 15000 });
        resolve();
      })
    })
  }

  // =============================== Helpers =============================== //
  canClaim() {
    const state = this.state;

    if (
      !state.loading && // Isn't loading
      state.sale_data.is_claim_period && // Is claim period
      state.sale_data.deposited > 0 // Has deposited
    ) {
      return true;
    } else {
      return false;
    }
  }

  canInvest() {
    const state = this.state;

    if (
      !state.loading && // Isn't loading
      !state.sale_data.is_claim_period && // Isn't claim period
      !state.sale_data.is_closed && // Sale isn't closed
      (
        (
          state.sale_data.is_public_sale && // Is public sale
          !state.sale_data.is_whitelisted &&  // Isn't whitelisted
          state.sale_data.deposited !== state.sale_data.max_public_sale_per_account // Hasn't contributed max
        ) || // Or
        (
          state.sale_data.is_private_sale && // Is private sale
          state.sale_data.is_whitelisted &&  // Is whitelisted
          state.sale_data.deposited !== state.sale_data.max_private_sale_per_account // Hasn't contributed max
        )
      )
    ) {
      return true;
    } else {
      return false;
    }
  }

  isSoldOut() {
    const state = this.state;

    if (
      !state.loading && // Isn't loading
      state.account !== undefined && // Is signed in
      state.sale_data.deposited > 0 && // Has contributed
      (
        (
          state.sale_data.is_public_sale && // Is public sale
          !state.sale_data.is_whitelisted &&  // Isn't whitelisted
          state.sale_data.deposited === state.sale_data.max_public_sale_per_account // Has contributed max
        ) || // Or
        (
          state.sale_data.is_private_sale && // Is private sale
          state.sale_data.is_whitelisted &&  // Is whitelisted
          state.sale_data.deposited === state.sale_data.max_private_sale_per_account // Has contributed max
        )
      )
    ) {
      return true;
    } else {
      return false;
    }
  }

  render() {
    const state = this.state;
    const can_claim = this.canClaim();
    const can_invest = this.canInvest();
    const is_sold_out = this.isSoldOut();
    const now = Date.now();

    return (
      <div className={styles.root}>
        <ToastContainer position="bottom-right" />

        <h1>INDEX DAO</h1>

        <div className={styles["modal-wrapper"]}>
          <div className={styles.modal}>
            <div className={styles.modal__title}>
              {(
                now >= 1641207600325 &&
                state.sale_data.is_closed === false
              ) && (
                <div className={styles["pulse-dot"]}></div>
              )}
              <h2>Index DAO Seed Round</h2>
            </div>

            {now >= 1641207600325 && (
              <div className={styles.modal__subtitle}>
                {state.sale_data.is_claim_period && (
                  <p>aINDEX IS NOW CLAIMABLE (ALPHA INDEX)</p>
                )}

                {!state.sale_data.is_claim_period && (
                  <React.Fragment>
                    {state.sale_data.is_closed && (
                      <p>THIS SEED ROUND HAS CONCLUDED! aINDEX (ALPHA INDEX) WILL BE CLAIMABLE HERE WITHIN THE NEXT FEW DAYS AND WILL BE EXCHANGABLE 1:1 FOR INDEX ON LAUNCH (15TH)</p>
                    )}

                    {!state.sale_data.is_closed && (
                      <React.Fragment>
                        {state.sale_data.is_private_sale && (
                          <p>CURRENT ACTIVE SALE: WHITELIST</p>
                        )}

                        {state.sale_data.is_public_sale && (
                          <p>CURRENT ACTIVE SALE: PUBLIC</p>
                        )}
                      </React.Fragment>
                    )}
                  </React.Fragment>
                )}
              </div>
            )}

            {now < 1641207600325 && (
              <div className={styles.modal__subtitle}>
                <p>SALE WILL LAUNCH AT 11:00 UTC</p>
              </div>
            )}

            <div>
              <div className={styles.totals}>
                <div>
                  <div className={styles.title}>YOUR ADDRESS</div>
                  {state.loading || state.account === undefined ?
                    <Skeleton type="title" /> :
                    <div className={styles.number}>{state.account.substring(0, 8)}...</div>
                  }
                </div>

                <div>
                  <div className={styles.title}>PRICE PER INDEX</div>
                  {state.loading || state.account === undefined ?
                    <Skeleton type="title" /> :
                    <div className={styles.number}>{state.sale_data.price_in_mim} MIM</div>
                  }
                </div>

                <div>
                  <div className={styles.title}>TOTAL INDEX BOUGHT</div>
                  {state.loading || state.account === undefined ?
                    <Skeleton type="title" /> :
                    <div className={styles.number}>{Number(Math.floor(state.sale_data.sold)).toLocaleString()}{state.sale_data.is_closed ? "" : `/${Number(state.sale_data.max_sold).toLocaleString()}`}</div>
                  }
                </div>

                <div>
                  <div className={styles.title}>YOUR INDEX</div>
                  {state.loading || state.account === undefined ?
                    <Skeleton type="title" /> :
                    <React.Fragment>
                      {state.sale_data.is_whitelisted ?
                        <div className={styles.number}>{Number(state.sale_data.deposited).toLocaleString()}/{Number(state.sale_data.max_private_sale_per_account).toLocaleString()}</div> :
                        <div className={styles.number}>{Number(state.sale_data.deposited).toLocaleString()}/{Number(state.sale_data.max_public_sale_per_account).toLocaleString()}</div>
                      }
                    </React.Fragment>
                  }
                </div>
              </div>

              <div className={styles.inputs}>
                <div className={styles["input-title"]}>
                  <span>MIM TO INVEST {state.account === undefined ? "" : `(BALANCE:  ${Number(contracts.mim.balance).toLocaleString()})`}</span>
                </div>

                <div className={styles["input-wrapper"]}>
                  <input
                    className="input"
                    disabled={!can_invest || is_sold_out}
                    min={0}
                    name="amount_mim"
                    onBlur={this.handleBlur}
                    onChange={this.handleChange}
                    type="number"
                    value={this.state.amount_mim}
                  />

                  <span>MIM</span>
                </div>

                <div className={styles.arrow}>↓</div>

                <div className={styles["input-title"]}>
                  <span>INDEX YOU WILL RECEIVE</span>
                </div>

                <div className={styles["input-wrapper"]}>
                  <input
                    className="input"
                    disabled={true}
                    min={0}
                    name="amount_index"
                    type="number"
                    value={this.state.amount_index}
                  />

                  <span>INDEX</span>
                </div>
              </div>

              {state.account === undefined && (
                <div className={styles["connect-button"]}>
                  <button
                    className="button button--primary button--large"
                    disabled={state.loading}
                    onClick={this.connectWallet}
                  >
                    Connect Wallet
                  </button>
                </div>
              )}

              {state.account !== undefined && (
                <div className={styles.buttons}>
                  <button
                    className="button button--large"
                    disabled={!can_invest || contracts.mim.approved}
                    onClick={this.approve}
                  >
                    {contracts.mim.approved ? "Approved" : "Approve"}
                  </button>

                  <button
                    className="button button--large"
                    disabled={!can_invest || is_sold_out || !contracts.mim.approved}
                    onClick={this.deposit}
                  >
                    {is_sold_out ? "Sold Out" : "Invest"}
                  </button>
                </div>
              )}

              {state.transactions.length > 0 && (
                <div className={styles.transactions}>
                  <span className={styles.title}>Recent transactions</span>

                  {state.transactions.map((transaction, index) => {
                    return (
                      <div className={styles.transaction} key={index}>
                        <span>{transaction.name}</span>

                        <a className="link" href={`https://snowtrace.io/tx/${transaction.hash}`} target="_blank" rel="noopener noreferrer">View on Snowtrace</a>
                      </div>
                    );
                  })}
                </div>
              )}

              {(state.loading || state.account === undefined) && (
                <div className={styles.notes}>
                  <p>
                    <Skeleton type="paragraph" />
                    <Skeleton type="paragraph" />
                  </p>
                  <p>
                    <Skeleton type="paragraph" />
                    <Skeleton type="paragraph" />
                  </p>
                </div>
              )}

              {(
                !state.loading &&
                state.account !== undefined &&
                now >= 1641207600325
              ) && (
                <div className={styles.notes}>
                  {!state.sale_data.is_claim_period && (
                    <React.Fragment>
                      {(
                        (
                          state.sale_data.is_private_sale &&
                          state.sale_data.deposited > 0 &&
                          state.sale_data.deposited === state.sale_data.max_private_sale_per_account
                        ) ||
                        (
                          state.sale_data.is_public_sale &&
                          state.sale_data.deposited > 0 &&
                          state.sale_data.deposited === state.sale_data.max_public_sale_per_account
                        )
                      ) && (
                        <p>📈 You have contributed the maximum allowed! Stay tuned for our platform launch where you will be able to stake your INDEX and start earning the rewards of decentralized diversification.</p>
                      )}

                      {!state.sale_data.is_closed && (
                        <React.Fragment>
                          {state.sale_data.is_whitelisted && (
                            <React.Fragment>
                              {state.sale_data.is_private_sale && (
                                <p>Welcome angel investors and congratulations on attaining a position in this whitelist. You now have the priveledge of being a part of this historic seed round. Join in the revolution of decentralized diversification with Index DAO.</p>
                              )}

                              {state.sale_data.is_public_sale && (
                                <p>Welcome angel investors and congratulations on being a part of the whitelist. The public sale has now commenced which is open to all those that missed out on a whitelist spot. Thank you for participating and welcome to the revolution of decentralized diversification with Index DAO.</p>
                              )}
                            </React.Fragment>
                          )}

                          {!state.sale_data.is_whitelisted && (
                            <React.Fragment>
                              {state.sale_data.is_private_sale && (
                                <React.Fragment>
                                  <p>ℹ Your address does not appear in the whitelist. Please double check that you are connected with the correct account. If you believe this to be a mistake please contact Vanguard or Torque via Discord. Otherwise monitor this page and the Discord server for an announcement when the public sale of INDEX is active.</p>
                                  <p>Welcome colleagues, congratulations on finding your way here. Welcome to the revolution of decentralized diversification.</p>
                                </React.Fragment>
                              )}

                              {state.sale_data.is_public_sale && (
                                <p>Welcome colleagues, congratulations on finding your way here. The public sale has commenced and you are now able to invest into the revolution of decentralized diversification. Welcome to Index DAO!</p>
                              )}
                            </React.Fragment>
                          )}

                          <p>📈 INDEX bought from this seed round will be claimable on this page at token launch!</p>
                        </React.Fragment>
                      )}

                      {state.sale_data.is_closed && (
                        <React.Fragment>
                          {state.sale_data.deposited > 0 && (
                            <p>The Index DAO seed round has now concluded! Thank you for participating colleague. Your investment here is the start of your journey into decentralized diversification. aINDEX (alpha INDEX) will be claimable here within the next few days and will be exchangable 1:1 for INDEX on launch (15th). Join our <a href="https://discord.gg/indexdao">Discord</a> for the latest updates regarding the protocol and launch!</p>
                          )}

                          {state.sale_data.deposited === 0 && (
                            <p>The Index DAO seed round has now concluded! The protocol and liquidity pool will be launched on the 15th (exact time to be determined) after which you will be able to purchase and stake INDEX to gain exposure to decentralized diversification! Join our <a href="https://discord.gg/indexdao">Discord</a> for the latest updates regarding the protocol and launch!</p>
                          )}
                        </React.Fragment>
                      )}
                    </React.Fragment>
                  )}

                  {state.sale_data.is_claim_period && (
                    <p>📈 Your aINDEX (alpha INDEX) is now claimable! Click the claim button below to receive your aINDEX which will be exchangable 1:1 for INDEX on launch (15th). Join our <a href="https://discord.gg/indexdao">Discord</a> for the latest updates regarding the protocol and launch!</p>
                  )}
                </div>
              )}

              {now < 1641207600325 && (
                <div className={styles.notes}>
                  <p>The INDEX sale will commence at 11:00 UTC! All whitelist address will be added then.</p>
                </div>
              )}
            </div>

            {state.account !== undefined && (
              <div className={styles.buttons}>
                <button
                  className="button button--large"
                  disabled={!can_claim}
                  onClick={this.claim}
                >
                  Claim aINDEX
                </button>

                <button
                  className="button button--large"
                  disabled={state.loading || !state.sale_data.is_claim_period}
                  onClick={this.addIndexToWallet}
                >
                  Add aINDEX to Wallet
                </button>
              </div>
            )}
          </div>

          {state.loading && (
            <div className={styles["loader-wrapper"]}>
              <div className={styles.loader}><div></div><div></div><div></div><div></div></div>
            </div>
          )}
        </div>
      </div>
    )
  }
}

export default App;
