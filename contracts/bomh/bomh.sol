pragma solidity 0.5.16;
pragma experimental ABIEncoderV2;


import { Masset } from "../masset/Masset.sol";
import { IMStableHelper } from "../interfaces/IMStableHelper.sol";
import { ISavingsContract } from "../interfaces/ISavingsContract.sol";
import { IBasketManager } from "../interfaces/IBasketManager.sol";
import { MassetStructs } from "../masset/shared/MassetStructs.sol";
import { ERC20MintOwn } from "./ERC20MintOwn.sol";
import { Auction } from "./Auction.sol";


import { StableMath } from "../shared/StableMath.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeMath } from "@openzeppelin/contracts/math/SafeMath.sol";
// import { ERC20MintOwn } from "@openzeppelin/contracts/token/ERC20/ERC20MintOwn.sol";


contract BoMH is MassetStructs {
    using SafeMath for uint256;
    using StableMath for uint256;    
    
    // Private to reduce the number of functions so that
    // gas is saved from not having to iterate through as
    // many functions before a match is found for a given call
    uint256 constant private BIG_NUM = uint256(-1);
    uint256 constant private STANDARD_DECS = 18;
    
    // mStable
    Masset public mUSD;
    ISavingsContract public mUSDSAVE;
    IBasketManager public basketManager;
    IMStableHelper public mStableHelper;
    
    // 
    
    ERC20MintOwn public mhUSD;
    ERC20MintOwn public mhCoin;
    // The percent of deposits to keep in reserve in 4 digit
    // In 2 decimal base points, i.e. 10000 = 100%
    uint256 public reserveFraction;
    uint256 constant private MAX_FRACTION = 10000;
    IERC20[] public reserveBassets;
    // A mapping is used in addition to reserveBassets so
    // that, when checking if support exists, only 1 state
    // variable needs to be read as opposed to many, 
    // therefore saving gas
    mapping (address => bool) public bassetSupported;
    
    
    constructor(
        Masset _mUSD, 
        ISavingsContract _mUSDSAVE,
        IBasketManager _basketManager,
        IMStableHelper _mStableHelper
    ) public {
        mUSD = _mUSD;
        mUSDSAVE = _mUSDSAVE;
        basketManager = _basketManager;
        mStableHelper = _mStableHelper;
        
        (Basset[] memory bassets, uint256 len) = basketManager.getBassets();
        for (uint256 i; i < len; i++) {
            addBassetSupport(IERC20(bassets[i].addr));
        }
        
        mhUSD = new ERC20MintOwn("TotallyLegitFiatCoinThatHasAbsolutelyNoRiskWhatsoever", "R3KT");
        mhCoin = new ERC20MintOwn("MoralHazardCoin", "MHC");
        mhCoin.mint(msg.sender, 1e21);
        
        // Keep 1% of funds liquid in reserve. What could
        // possibly go wrong??
        reserveFraction = 100;
    }
    
    
    // Ensure the atomicity of adding support for a token
    function addBassetSupport(IERC20 _basset) private {
        bassetSupported[address(_basset)] = true;
        reserveBassets.push(_basset);
        _basset.approve(address(mUSD), BIG_NUM);
    }
    
    
    function deposit(IERC20 _basset, uint256 _bassetQuantity) public ensureColl {
        // Arguably these aren't needed as they're already in `mint`
        require(address(_basset) != address(0), "Need a token address");
        require(_bassetQuantity != 0, "Get your peasant ass out of here");
        
        // Transfer the user's bassets. Tokens with a transfer fee not supported
        uint256 bassetOldBal = _basset.balanceOf(address(this));
        _basset.transferFrom(msg.sender, address(this), _bassetQuantity);
        
        require(
            _basset.balanceOf(address(this)) == bassetOldBal.add(_bassetQuantity), 
            "transferFrom amount unexpected"
        );
        
        // Ensure that `approve` has been called for this basset. If 
        // the basset isn't actually supported by mStable, this tx 
        // is guaranteed to revert after the mint attempt. This enables
        // the system to automatically update itself as mStable adds new
        // bassets
        if (!bassetSupported[address(_basset)]) {
            addBassetSupport(_basset);
        }
        
        // Mint mUSD
        uint256 bassetQuantityLend = _bassetQuantity.mul(MAX_FRACTION.sub(reserveFraction)).div(MAX_FRACTION);
        uint256 massetsQuantity = mUSD.mint(address(_basset), bassetQuantityLend);
        uint256 ratio = basketManager.getBasset(address(_basset)).ratio;
        
        // This guarantees unsupported bassets with revert
        require(
            _basset.balanceOf(address(this)) == _bassetQuantity.sub(bassetQuantityLend),
            "lent unexpected amount of basset"
        );
        require(
            massetsQuantity == bassetQuantityLend.mulRatioTruncate(ratio), 
            "Unexpected minted amount"
        );
        
        // SAVE
        mUSDSAVE.depositSavings(massetsQuantity);
        
        // Mint the normalised quantity
        mhUSD.mint(msg.sender, _bassetQuantity.mulRatioTruncate(ratio));
    }
    
    
    function withdraw(uint256 _mhUSDAmount) public ensureColl {
        
        require(_mhUSDAmount != 0, "Get your peasant ass out of here");
        require(mhUSD.balanceOf(msg.sender) >= _mhUSDAmount, "Not enough coins");
        
        // Redeem credits
        uint256 mUSDAmount = _mhUSDAmount.mul(MAX_FRACTION.sub(reserveFraction)).div(MAX_FRACTION);
        uint256 credits = mStableHelper.getSaveRedeemInput(mUSDSAVE, mUSDAmount);
        mUSDSAVE.redeem(credits);
        
        // Redeem mUSD
        (bool valid, string memory reason, address bassetAddr) = 
            mStableHelper.suggestRedeemAsset(address(mUSD));
        require(valid, reason);
        mUSD.redeemTo(bassetAddr, mUSDAmount, msg.sender);
        
        // Send remaining funds from the reserve
        // mhUSD and mUSD are essentially equivalent units here
        uint256 mhUSDOutstanding = _mhUSDAmount.sub(mUSDAmount);
        uint256 bassetQtyInRes;
        uint256 ratio;
        uint256 mhUSDEquivInRes;
        uint256 bassetAmount;
        bool sent;
        
        for (uint256 i; i < reserveBassets.length; i++) {
            bassetQtyInRes = reserveBassets[i].balanceOf(address(this));
            ratio = basketManager.getBasset(address(reserveBassets[i])).ratio;
            mhUSDEquivInRes = bassetQtyInRes.mulRatioTruncate(ratio);
            
            if (mhUSDEquivInRes <= mhUSDOutstanding) {
                reserveBassets[i].transfer(msg.sender, bassetQtyInRes);
                if (mhUSDEquivInRes == mhUSDOutstanding) { break; }
                mhUSDOutstanding = mhUSDOutstanding.sub(mhUSDEquivInRes);
            } else {
                bassetAmount = mhUSDOutstanding.divRatioPrecisely(ratio);
                reserveBassets[i].transfer(msg.sender, bassetAmount);
                sent = true;
                break;
            }
        }
        
        require(sent, "Not enough in reserve");
        
        mhUSD.burn(msg.sender, _mhUSDAmount);
    }
    
    
    function cashOut() public ensureColl {
        // Get amount of credits to redeem
        uint256 mUSDEquiv = mStableHelper.getSaveBalance(mUSDSAVE, address(this));
        uint256 mhUSDSupply = mhUSD.totalSupply();
        require(mUSDEquiv >= mhUSDSupply, "Credits value less than mhUSD!");
        uint256 creditProfits = mStableHelper.getSaveRedeemInput(mUSDSAVE, mUSDEquiv.sub(mhUSDSupply));
        uint256 mUSDProfits = mUSDSAVE.redeem(creditProfits);
        
        Auction auction = new Auction(86400, address(this), IERC20(mUSD), mhCoin);
        mUSD.transfer(address(auction), mUSDProfits);
    }
    
    
    function mhCoinBurn() public {
        uint256 mhCoinBal = mhCoin.balanceOf(address(this));
        mhCoin.burn(address(this), mhCoinBal);
    }
    

    // Ensure there is 100% collateral backing the reserve
    modifier ensureColl() {
        _;
        uint256 totalColl;
        uint256 ratio;
        totalColl += mUSD.balanceOf(address(this));
        
        for (uint256 i; i < reserveBassets.length; i++) {
            ratio = basketManager.getBasset(address(reserveBassets[i])).ratio;
            totalColl = totalColl.add(reserveBassets[i].balanceOf(address(this)).mulRatioTruncate(ratio));
        }
        
        require(mhUSD.totalSupply() <= totalColl, "Uh oh, BoMH on brink of bailout");
    }
}
