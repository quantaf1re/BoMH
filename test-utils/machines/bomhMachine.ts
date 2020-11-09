import { BN } from "@utils/tools";
import * as t from "types/generated";
import { MassetMachine, StandardAccounts, SystemMachine, MassetDetails } from "@utils/machines";
import * as bc from "@utils/bomhConstants";
import { Address } from "../../types";
import { time } from "@openzeppelin/test-helpers";
import { fullScale, ONE_DAY, TEN_DAYS } from "@utils/constants";


const BoMH = artifacts.require("BoMH");
const MStableHelper = artifacts.require("MStableHelper");
const ERC20MintOwn = artifacts.require("ERC20MintOwn");
const Auction = artifacts.require("Auction");


// FBI: *sees file name*
// FBI: *wants to know your location*
/**
 * @dev The BoMHMachine is responsible for creating the BoMH contract
 * and all other contract mocks (systemMachine etc) necessary for testing
 */
export class BoMHMachine {
    
    // mStable
    public systemMachine: SystemMachine;

    public massetMachine: MassetMachine;
    
    public massetDetails: MassetDetails;
    
    public mUSD: t.MassetInstance;
    
    public mUSDSAVE: t.SavingsContractInstance;
    
    public mUSDSaveMan: t.SavingsManagerInstance;
    
    public mUSDBaskMan: t.BasketManagerInstance;
    
    public mstHelp: t.MStableHelperInstance;
    

    // stablecoins
    public dai: t.MockErc20Instance;
    
    public usdc: t.MockErc20Instance;
    
    public tusd: t.MockErc20Instance;
    
    public usdt: t.MockErc20Instance;
    
    public daiTotSup: BN;
    
    public swapFee: BN;

    
    // BoMH
    public sa: StandardAccounts;

    public bomh: t.BoMhInstance;
    
    public mhUSD: t.Erc20MintOwnInstance;
    
    public mhCoin: t.Erc20MintOwnInstance;

    public initiated: boolean;
    
    
    constructor() {
        this.initiated = false;
    }


    public async init(accounts: Address[]) {
        this.sa = new StandardAccounts(accounts);

        // Set up the mStable system
        this.systemMachine = new SystemMachine(this.sa.all);
        await this.systemMachine.initialiseMocks(true, false);
        this.massetMachine = this.systemMachine.massetMachine;
        this.massetDetails = this.systemMachine.mUSD;
        this.mUSD = this.massetDetails.mAsset;
        this.swapFee = await this.mUSD.swapFee();
        this.mUSDSAVE = this.systemMachine.savingsContract;
        this.mUSDSaveMan = this.systemMachine.savingsManager;
        this.mUSDBaskMan = this.massetDetails.basketManager;
        // dai and tusd have suspiciously low amounts deposited
        // for creating mUSD - a bug in the machine??
        [this.dai, this.usdc, this.tusd, this.usdt] = this.massetDetails.bAssets;
        this.daiTotSup = await this.tusd.totalSupply();
        this.mstHelp = await MStableHelper.new();

        // Create BoMH
        this.bomh = await BoMH.new(
            this.mUSD.address, 
            this.mUSDSAVE.address, 
            this.mUSDBaskMan.address, 
            this.mstHelp.address,
            bc.MHUSD_NAME,
            bc.MHUSD_SYMBOL,
            bc.MHCOIN_NAME,
            bc.MHCOIN_SYMBOL,
            bc.MHCOIN_INIT_SUP,
            bc.RES_FRAC
        );
        this.mhUSD = await ERC20MintOwn.at(await this.bomh.mhUSD());
        this.mhCoin = await ERC20MintOwn.at(await this.bomh.mhCoin());


        // Set initial balances for test
        await this.tusd.transfer(this.sa.dummy1, bc.SC_INIT_AMOUNT);
        await this.tusd.approve(this.bomh.address, bc.SC_INIT_AMOUNT, { from: this.sa.dummy1});

        for (const basset of this.massetDetails.bAssets) {
            basset.approve(this.mUSD.address, bc.BIG_NUM, { from: this.sa.default });
        }

        this.initiated = true;
    }

    /**
     * @dev Generate interest for masset hodlers by using swap to give fees to mStable
     *      and distribute the interest after a decent amount of time (10 days)
     */
    public async genInterest() {
        // Swap and generate fees/interest
        await this.mUSD.swap(this.tusd.address, this.usdt.address, fullScale, this.sa.default, { from: this.sa.default });
        await this.mUSD.swap(this.usdt.address, this.tusd.address, fullScale, this.sa.default, { from: this.sa.default });
        await this.mUSD.swap(this.tusd.address, this.usdt.address, fullScale, this.sa.default, { from: this.sa.default });
        await this.mUSD.swap(this.usdt.address, this.tusd.address, fullScale, this.sa.default, { from: this.sa.default });
        
        // Collect the interest
        await time.increase(TEN_DAYS);
        await this.mUSDSaveMan.collectAndDistributeInterest(this.mUSD.address);
    }

    /**
     * @dev Cumulative action up to generate interest in the series of:
     *      deposit > generate interest > withdraw > cash out > bid and end auction > burn mhCoins
     */
    public async cumulGenInterest() {
        await this.bomh.deposit(this.tusd.address, bc.DEP_AMOUNT, { from: this.sa.dummy1});
        await this.genInterest();
    }

    /**
     * @dev Cumulative action up to withdraw in the series of:
     *      deposit > generate interest > withdraw > cash out > bid and end auction > burn mhCoins
     * @return Transaction      the generate interest transaction so events can be analysed
     */
    public async cumulWithdraw(): Promise<any> {
        await this.cumulGenInterest();
        return this.bomh.withdraw(bc.DEP_AMOUNT, { from: this.sa.dummy1 });
    }

    /**
     * @dev Cumulative action up to cash out in the series of:
     *      deposit > generate interest > withdraw > cash out > bid and end auction > burn mhCoins
     * @return Transaction      the cash out transaction so events can be analysed
     */
    public async cumulCashOut(): Promise<any> {
        await this.cumulWithdraw();
        return this.bomh.cashOut();
    }

    /**
     * @dev Cumulative action up to bid and end auction in the series of:
     *      deposit > generate interest > withdraw > cash out > bid and end auction > burn mhCoins
     * @param bidAmount Amount of mhCoin to bid on the auction
     */
    public async cumulAuctionEnded(bidAmount: BN) {
        await this.cumulCashOut();
        
        // Bid on and finish the auction
        const auction = await Auction.at(await this.bomh.indexToAuctionAddr(0));
        await this.mhCoin.transfer(this.sa.dummy2, bidAmount, { from: this.sa.default });
        await this.mhCoin.approve(auction.address, bidAmount, { from: this.sa.dummy2 });
        await auction.bid(bidAmount, { from: this.sa.dummy2 });
        await time.increase(ONE_DAY);
        await auction.endAuction();
    }

    /**
     * @dev Cumulative action up to burn mhCoins in the series of:
     *      deposit > generate interest > withdraw > cash out > bid and end auction > burn mhCoins
     * @param bidAmount Amount of mhCoin to bid on the auction
     */
    public async cumulMHCoinBurn(bidAmount: BN) {
        await this.cumulAuctionEnded(bidAmount);
        await this.bomh.mhCoinBurn();
    }
}

export default BoMHMachine;
