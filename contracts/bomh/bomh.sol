pragma solidity 0.5.16;
pragma experimental ABIEncoderV2;


import { IBoMH } from "../interfaces/IBoMH.sol";
import { Masset } from "../masset/Masset.sol";
import { IMStableHelper } from "../interfaces/IMStableHelper.sol";
import { ISavingsContract } from "../interfaces/ISavingsContract.sol";
import { IBasketManager } from "../interfaces/IBasketManager.sol";
import { MassetStructs } from "../masset/shared/MassetStructs.sol";
import { ERC20MintOwn } from "./ERC20MintOwn.sol";
import { Auction } from "./Auction.sol";
import { InitializableReentrancyGuard } from "../shared/InitializableReentrancyGuard.sol";


import { StableMath } from "../shared/StableMath.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeMath } from "@openzeppelin/contracts/math/SafeMath.sol";


/**
 * @title   BoMH
 * @author  James Key
 * @notice  Bank of Moral Hazard is a fractional reserve bank which lends
 *          out deposited assets to lending platforms and gives the profit
 *          to holders of the governance token.
 */
contract BoMH is IBoMH, MassetStructs, InitializableReentrancyGuard {
    using SafeMath for uint256;
    using StableMath for uint256;    
    
    // Many are private to reduce the number of functions so that
    // gas is saved from not having to iterate through as
    // many functions before a match is found for a given call
    uint256 constant private BIG_NUM = uint256(-1);
    // Standard nnumber of decimals for tokens
    uint8 constant private STAN_DECS = 18;
    uint256 constant private DAY_SECS = 86400;
    
    // mStable
    Masset public mUSD;
    ISavingsContract public mUSDSAVE;
    IBasketManager public basketManager;
    IMStableHelper public mStableHelper;
    
    // BoMH
    ERC20MintOwn public mhUSD;
    ERC20MintOwn public mhCoin;
    // The percent of deposits to keep in reserve in 4 digit
    // In 2 decimal base points, i.e. 10000 = 100%
    uint256 public reserveFraction;
    uint256 constant private MAX_FRACTION = 10000;
    IERC20[] public reserveTokens;
    // A mapping is used in addition to reserveTokens so
    // that, when checking if support exists, only 1 state
    // variable needs to be read as opposed to many, 
    // therefore saving gas
    mapping (address => bool) public bassetSupported;

    // Auctions
    mapping(uint256 => address) public indexToAuctionAddr;
    uint256 private numAuctions;

    // Events are usually declared in interfaces but I'll put
    // them here to be consistent with the rest of the codebase
    event Deposited(address indexed depositor, IERC20 indexed basset, uint256 indexed bassetQuantity);
    event Withdrawn(address indexed withdrawer, uint256 indexed bassetQuantity);
    event CashedOut(uint256 indexed mUSDProfit, address indexed auctionAddr);
    
    
    /**
     * @dev Initialise contract
     * @param _mUSD             mUSD address
     * @param _mUSDSAVE         savings contract address for mUSD
     * @param _basketManager    basket manager address
     * @param _mStableHelper    mStableHlper address
     * @param _mhUSDName        name for BoMH's USD stablecoin
     * @param _mhUSDSymbol      ticker symbol for BoMH's USD stablecoin
     * @param _mhCoinName       name for BoMH's governance token
     * @param _mhCoinSymbol     ticker symbol for BoMH's governance token
     * @param _mhCoinInitSup    initial total supply for mhCoin (in wei, 18 dec)
     * @param _reserveFraction  the BPS of assets to keep in reserve (100 = 1%)
     */
    constructor(
        Masset _mUSD, 
        ISavingsContract _mUSDSAVE,
        IBasketManager _basketManager,
        IMStableHelper _mStableHelper,
        string memory _mhUSDName,
        string memory _mhUSDSymbol,
        string memory _mhCoinName,
        string memory _mhCoinSymbol,
        uint256 _mhCoinInitSup,
        uint256 _reserveFraction
    ) public {
        mUSD = _mUSD;
        mUSDSAVE = _mUSDSAVE;
        mUSD.approve(address(mUSDSAVE), BIG_NUM);
        basketManager = _basketManager;
        mStableHelper = _mStableHelper;
        
        (Basset[] memory bassets, uint256 len) = basketManager.getBassets();
        for (uint256 i; i < len; i++) {
            addBassetSupport(IERC20(bassets[i].addr));
        }
        
        mhUSD = new ERC20MintOwn(_mhUSDSymbol, _mhUSDSymbol, STAN_DECS);
        mhCoin = new ERC20MintOwn(_mhCoinName, _mhCoinSymbol, STAN_DECS);
        mhCoin.mint(msg.sender, _mhCoinInitSup);
        
        reserveFraction = _reserveFraction;

        _initialize();
    }
    
    
    /**
     * @dev Add support for bassets atomically
     * @param _basset       basset address to add
     */
    function addBassetSupport(IERC20 _basset) private {
        bassetSupported[address(_basset)] = true;
        reserveTokens.push(_basset);
        _basset.approve(address(mUSD), BIG_NUM);
    }
    
    /**
     * @dev Deposit a basset to BoMH, where a % will be kept as reserve
     *      and the rest will be lent out with mStable. Don't forget
     *      to call approve beforehand!
     * @param _basset           basset address to use
     * @param _bassetQuantity   quantity of _basset to deposit
     */
    function deposit(IERC20 _basset, uint256 _bassetQuantity) public ensureColl nonReentrant {
        // Arguably these aren't needed as they're already in `mint`, 
        // but for the sake of security guarantees, leave them in
        require(address(_basset) != address(0), "Need a token address");
        require(_bassetQuantity != 0, "Get your peasant ass out of here");
        
        // Transfer the user's bassets. Tokens with a transfer fee not supported
        uint256 bassetOldBal = _basset.balanceOf(address(this));
        _basset.transferFrom(msg.sender, address(this), _bassetQuantity);
        
        // Ensure no rug-pull-like funny business
        require(
            _basset.balanceOf(address(this)) == bassetOldBal.add(_bassetQuantity), 
            "transferFrom amount unexpected"
        );
        
        // Ensure that `approve` has been called for this basset from BoMH. If 
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
        
        // This guarantees bassets not supported by mStable will revert
        require(
            _basset.balanceOf(address(this)) == _bassetQuantity.sub(bassetQuantityLend),
            "Lent unexpected amount of basset"
        );
        require(
            massetsQuantity == bassetQuantityLend.mulRatioTruncate(ratio), 
            "Unexpected minted amount"
        );
        
        // SAVE
        mUSDSAVE.depositSavings(massetsQuantity);
        
        // Mint the normalised quantity
        mhUSD.mint(msg.sender, _bassetQuantity.mulRatioTruncate(ratio));
        emit Deposited(msg.sender, _basset, _bassetQuantity);
    }
    
    /**
     * @dev Withdraw collateral equivalent to the mhUSD specified. The
     *      type of collateral returned depends on whatever is in the
     *      reserve at the time and what mStable recommends to redeem in.
     *      Since people can deposit in 1 asset type and withdraw in another,
     *      it's better to allow that flexibility and not reduce the overhead
     *      (and gas) needed to track all that and instead iterate through
     *      all held bassets and send the equivalent of the mhUSD in whatever
     *      is on hand. E.g. if the reserve holds 100dai and 100tusd, and a user
     *      withdraws 150mhUSD, it'll send 100dai and 50tusd to the user.
     *      NOTE: _mhUSDAmount is the nominal amount. The real amount is
     *      _mhUSDAmount - mStable's fees. Hidden fees... just like a 
     *      real bank! :D
     * @param _mhUSDAmount      amount of mhUSD equivalent assets to withdraw
     */
    function withdraw(uint256 _mhUSDAmount) public ensureColl nonReentrant {
        
        require(_mhUSDAmount != 0, "Get your peasant ass out of here");
        require(mhUSD.balanceOf(msg.sender) >= _mhUSDAmount, "Not enough coins");
        
        // Redeem credits

        // ----- BUG SHOWCASE -----
        // Uncomment the 2 commented lines and comment the 2 uncommented lines
        // uint256 mUSDLentAmount = _mhUSDAmount.mul(MAX_FRACTION.sub(reserveFraction)).div(MAX_FRACTION);
        uint256 mUSDLentAmount = _mhUSDAmount.mul(MAX_FRACTION.sub(reserveFraction)).div(MAX_FRACTION).sub(1);
        // uint256 credits = mStableHelper.getSaveRedeemInput(mUSDSAVE, mUSDLentAmount).sub(1);
        uint256 credits = mStableHelper.getSaveRedeemInput(mUSDSAVE, mUSDLentAmount);

        mUSDSAVE.redeem(credits);
        
        // Redeem mUSD
        (bool valid, string memory reason, address bassetAddr) = 
            mStableHelper.suggestRedeemAsset(address(mUSD));
        require(valid, reason);
        mUSD.redeemTo(bassetAddr, mUSDLentAmount, msg.sender);
        
        // Send remaining funds from the reserve
        // mhUSD and mUSD are essentially equivalent units here
        mUSDLentAmount = mUSDLentAmount.add(1);
        uint256 mhUSDOutstanding = _mhUSDAmount.sub(mUSDLentAmount);
        uint256 bassetQtyInRes;
        uint256 ratio;
        uint256 mhUSDEquivInRes;
        uint256 bassetAmount;
        bool sent;
        
        // This is incase there was none of bassetAddr in the reserve
        // before calling mUSD.redeem() - we can't assume there is
        // _mhUSDAmount in the reserve after redeeming because the
        // collateral that is left before lending might've been withdrawn
        // somehow
        for (uint256 i; i < reserveTokens.length; i++) {
            bassetQtyInRes = reserveTokens[i].balanceOf(address(this));
            ratio = basketManager.getBasset(address(reserveTokens[i])).ratio;
            mhUSDEquivInRes = bassetQtyInRes.mulRatioTruncate(ratio);
            
            // If the amount outstanding is more than or equal to
            // the amount in reserve, then we just send everything
            // we have. If mhUSDEquivInRes is less than mhUSDOutstanding,
            // then we need to continue, else, we're done
            if (mhUSDEquivInRes <= mhUSDOutstanding) {
                reserveTokens[i].transfer(msg.sender, bassetQtyInRes);
                if (mhUSDEquivInRes == mhUSDOutstanding) {
                    sent = true;
                    break;
                }
                // Unnecessary to compute after sent = true
                mhUSDOutstanding = mhUSDOutstanding.sub(mhUSDEquivInRes);
            } else {
                // We have more than we need, so now we need to convert
                // the outstanding amount to the amount denominated in
                // this basset
                bassetAmount = mhUSDOutstanding.divRatioPrecisely(ratio);
                reserveTokens[i].transfer(msg.sender, bassetAmount);
                sent = true;
                break;
            }
        }       
        
        require(sent, "Not enough in reserve");
        
        mhUSD.burn(msg.sender, _mhUSDAmount);
        emit Withdrawn(msg.sender, _mhUSDAmount);
    }
    
    /**
     * @dev Get the profit generated by lending interest and send it to a
     *      newly created auction to be auctioned off for mhCoin.
     */
    function cashOut() public ensureColl {
        // Get amount of credits to redeem
        uint256 mUSDEquiv = mStableHelper.getSaveBalance(mUSDSAVE, address(this));
        uint256 mhUSDSupply = mhUSD.totalSupply();
        require(mUSDEquiv >= mhUSDSupply, "Credits value less than mhUSD!");
        uint256 creditProfits = mStableHelper.getSaveRedeemInput(mUSDSAVE, mUSDEquiv.sub(mhUSDSupply));
        uint256 mUSDProfits = mUSDSAVE.redeem(creditProfits);
        
        // Create auction
        Auction auction = new Auction(DAY_SECS, address(this), IERC20(mUSD), mhCoin);
        mUSD.transfer(address(auction), mUSDProfits);

        indexToAuctionAddr[numAuctions] = address(auction);
        emit CashedOut(mUSDProfits, address(auction));
        numAuctions = numAuctions.add(1);
    }
    
    /**
     * @dev Burn any mhCoin that is held at this address. The intention is that
     *      someone calls this after lending interest profits are auctioned
     *      off for mhCoin. Profits are essentially given to hodlers of mhCoin
     *      by reducing the supply of mhCoin and increasing the price.
     */
    function mhCoinBurn() public {
        uint256 mhCoinBal = mhCoin.balanceOf(address(this));
        mhCoin.burn(address(this), mhCoinBal);
    }

    /**
     * @dev Gets the full array of basset addresses that are supported.
     * @return tokens   Array of addresses
     */
    function getReserveTokens() public view returns (IERC20[] memory tokens) {
        tokens = reserveTokens;
    }
    
    /**
     * @dev Ensure there is 100% collateral backing the reserve.
     */
    modifier ensureColl() {
        _;
        uint256 totalColl;
        uint256 ratio;
        totalColl += mStableHelper.getSaveBalance(mUSDSAVE, address(this));
        
        for (uint256 i; i < reserveTokens.length; i++) {
            ratio = basketManager.getBasset(address(reserveTokens[i])).ratio;
            totalColl = totalColl.add(reserveTokens[i].balanceOf(address(this)).mulRatioTruncate(ratio));
        }
        
        require(totalColl >= mhUSD.totalSupply(), "Uh oh, BoMH on brink of bailout");
    }
}
