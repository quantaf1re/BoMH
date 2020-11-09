import { fullScale } from "@utils/constants";
import { BN } from "@utils/tools";
import { BoMHMachine } from "@utils/machines";


export const BoMH = artifacts.require("BoMH");
export const MStableHelper = artifacts.require("MStableHelper");
export const ERC20MintOwn = artifacts.require("ERC20MintOwn");
export const MockERC20 = artifacts.require("MockERC20");
export const Auction = artifacts.require("Auction");

export const MHUSD_NAME = "TotallyLegitFiatCoinThatHasAbsolutelyNoRiskWhatsoever";
export const MHUSD_SYMBOL = "R3KT";
export const MHCOIN_NAME = "MoralHazardCoin";
export const MHCOIN_SYMBOL = "MHC";
// Keep 1% of funds liquid in reserve. What could
// possibly go wrong?!?
export const RES_FRAC = new BN(100);
export const MAX_FRAC = new BN(10000);
export const MHCOIN_INIT_SUP = fullScale.mul(new BN(1000));

// Initial amounts for testing with
// export const SC_INIT_AMOUNT = fullScale.mul(new BN(100));
export const SC_INIT_AMOUNT = fullScale;
export const BIG_NUM = (new BN(2)).pow(new BN(256)).sub(new BN(1));
export const DEP_AMOUNT = SC_INIT_AMOUNT.div(new BN(2));
export const EXPECTED_BOMH_BAL = DEP_AMOUNT.mul(RES_FRAC).div(MAX_FRAC);
export const LENT_AMOUNT = DEP_AMOUNT.sub(EXPECTED_BOMH_BAL);
export const DEP_AMOUNT2 = DEP_AMOUNT.div(new BN(2));
export const BID_AMOUNT1 = fullScale.mul(new BN(100));
export const BID_AMOUNT2 = fullScale.mul(new BN(150));
