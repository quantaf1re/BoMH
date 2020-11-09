import { BoMHMachine } from "@utils/machines";
import { expectEvent, time, expectRevert } from "@openzeppelin/test-helpers";
import * as t from "types/generated";
import * as bc from "@utils/bomhConstants";
import { fullScale, ZERO, ONE_DAY, TEN_DAYS, ZERO_ADDRESS, DEAD_ADDRESS } from "@utils/constants";
import BN from "bn.js";


const MockERC20 = artifacts.require("MockERC20");


export const bm = new BoMHMachine();
 

export async function validInitState(_bm: BoMHMachine) {
    expect(await _bm.bomh.mUSD()).eq(_bm.mUSD.address);
    expect(await _bm.bomh.mUSDSAVE()).eq(_bm.mUSDSAVE.address);
    expect(await _bm.bomh.basketManager()).eq(_bm.mUSDBaskMan.address);
    expect(await _bm.bomh.mStableHelper()).eq(_bm.mstHelp.address);
    // Since we define _bm.mhUSD and _bm.mhCoin by the address
    // returned from _bm.bomh, _bm.mhUSD.address == _bm.bomh._bm.mhUSD() == true
    // doesn't mean it's != ZERO_ADDRESS (i.e. creation failed)
    expect(await _bm.bomh.mhUSD()).not.eq(ZERO_ADDRESS);
    expect(await _bm.bomh.mhUSD()).eq(_bm.mhUSD.address);
    expect(await _bm.bomh.mhCoin()).not.eq(ZERO_ADDRESS);
    expect(await _bm.bomh.mhCoin()).eq(_bm.mhCoin.address);
    expect(await _bm.bomh.reserveFraction()).bignumber.eq(bc.RES_FRAC);
    // Check the supported bassets match the basket and have approvals
    const [baskBassets, ] = await _bm.mUSDBaskMan.getBassets();
    for (let i in baskBassets) {
        expect(baskBassets[i].addr).eq(await _bm.bomh.reserveTokens(i));
        expect(await _bm.bomh.bassetSupported(baskBassets[i].addr)).eq(true);
        const token = await MockERC20.at(baskBassets[i].addr);
        expect(await token.allowance(_bm.bomh.address, _bm.mUSD.address)).bignumber.eq(bc.BIG_NUM);
    };
}


export async function validGetReserveTokens(_bm: BoMHMachine) {
    const [baskBassets, ] = await _bm.mUSDBaskMan.getBassets();
    const resTokens = await _bm.bomh.getReserveTokens();
    for (let i in baskBassets) {
        expect(baskBassets[i].addr).eq(resTokens[i]);
    };
}


export async function noAddedBassets(_bm: BoMHMachine) {
    const [baskBassets, ] = await _bm.mUSDBaskMan.getBassets();
    expect(baskBassets.length).eq(4);
}


export async function validDeposit(_bm: BoMHMachine, tx: any) {
    // tusd
    expect(await _bm.tusd.balanceOf(_bm.bomh.address)).bignumber.eq(bc.EXPECTED_BOMH_BAL);
    expect(await _bm.tusd.balanceOf(_bm.sa.dummy1)).bignumber.eq(bc.SC_INIT_AMOUNT.sub(bc.DEP_AMOUNT));
    
    // mStable
    expect(await _bm.mstHelp.getSaveBalance(_bm.mUSDSAVE.address, _bm.bomh.address))
        .bignumber.eq(bc.DEP_AMOUNT.sub(bc.EXPECTED_BOMH_BAL));
    
    // mhUSD
    expect(await _bm.mhUSD.balanceOf(_bm.sa.dummy1)).bignumber.eq(bc.DEP_AMOUNT);
    
    // bomh
    await expectEvent(tx.receipt, "Deposited", {
        depositor: _bm.sa.dummy1,
        basset: _bm.tusd.address,
        bassetQuantity: bc.DEP_AMOUNT,
    });
}

export async function validWithdraw(_bm: BoMHMachine, withdrawTx: any, amount: BN, account: string, noInterest: boolean) {
    // _bm.tusd
    expect(await _bm.tusd.balanceOf(_bm.bomh.address)).bignumber.eq(ZERO);
    const feePaid = bc.LENT_AMOUNT.mul(_bm.swapFee).div(fullScale);
    expect(await _bm.tusd.balanceOf(account)).bignumber.eq(bc.SC_INIT_AMOUNT.sub(feePaid));
    
    // mStable
    if (noInterest) {
        expect(await _bm.mstHelp.getSaveBalance(_bm.mUSDSAVE.address, _bm.bomh.address))
        .bignumber.eq(ZERO);
    } else {
        expect(await _bm.mstHelp.getSaveBalance(_bm.mUSDSAVE.address, _bm.bomh.address))
        .bignumber.not.eq(ZERO);
    }
    
    // _bm.mhUSD
    expect(await _bm.mhUSD.balanceOf(account)).bignumber.eq(ZERO);
    expect(await _bm.mhUSD.totalSupply()).bignumber.eq(ZERO);
    
    // _bm.bomh
    await expectEvent(withdrawTx.receipt, "Withdrawn", {
        withdrawer: account,
        bassetQuantity: amount,
    });
}

export async function validCashOut(_bm: BoMHMachine, auction: t.AuctionInstance, tx: any) {
    // mStable
    expect(await _bm.mstHelp.getSaveBalance(_bm.mUSDSAVE.address, _bm.bomh.address))
        .bignumber.eq(ZERO);
    const mUSDAuctionBal = await _bm.mUSD.balanceOf(auction.address);
    expect(mUSDAuctionBal).bignumber.not.eq(ZERO);
    
    // bomh
    await expectEvent(tx.receipt, "CashedOut", {
        mUSDProfit: mUSDAuctionBal,
        auctionAddr: auction.address,
    });
}

export async function validMHCoinBurn(_bm: BoMHMachine, amount: BN) {
    expect(await _bm.mhCoin.balanceOf(_bm.bomh.address)).bignumber.eq(ZERO);
    expect(await _bm.mhCoin.totalSupply()).bignumber.eq(bc.MHCOIN_INIT_SUP.sub(amount));
}


// For auctions

// token needs to be both MockERC20 and ERC20MintOwn to work in all tests
export async function validBid(auction: t.AuctionInstance, token: any, bidAmount: BN, _bidder: string, bidTx: any) {
    expect(await token.balanceOf(auction.address)).bignumber.eq(bidAmount);
    expect(await auction.highestBidder()).eq(_bidder);
    expect(await auction.highestBid()).bignumber.eq(bidAmount);
    await expectEvent(bidTx.receipt, "HighestBidIncreased", {
        bidder: _bidder,
        amount: bidAmount,
    });
}

export async function revBidAucEnd(auction: t.AuctionInstance, bidAmount: BN, bidder: string) {
    await time.increase(ONE_DAY);
    await expectRevert(
        auction.bid(bidAmount.mul(new BN(2)), { from: bidder }),
        "Auction already ended.",
    );
}

export async function revBidNotHigher(auction: t.AuctionInstance, bidder: string) {
    await expectRevert(
        auction.bid(ZERO, { from: bidder }),
        "There already is a higher bid.",
    );
}