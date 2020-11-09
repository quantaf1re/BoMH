pragma solidity 0.5.16;

import { SafeMath } from "@openzeppelin/contracts/math/SafeMath.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";


/**
 * @notice  Auction is a simple auction, that auctions off one
 *          token in exchange for another and sends the winning
 *          bid to the beneficiary. Adapted from SimpleAuction
 *          to use tokens instead of Ether.
 */
contract Auction {
    using SafeMath for uint256;

    address public beneficiary;
    uint public auctionEndTime;
    IERC20 public prizeToken;
    IERC20 public bidToken;

    // Current state of the auction.
    address public highestBidder;
    uint public highestBid;

    // Set to true at the end, disallows any change
    bool public ended;

    // Events that will be emitted on changes.
    event HighestBidIncreased(address bidder, uint amount);
    event AuctionEnded(address winner, uint amount);

    /**
     * @dev Initialise contract
     * @param _biddingTime      time in seconds before the auction
     *                          can be ended
     * @param _beneficiary      address to send `highestBid` amount of
     *                          `bidToken` to
     * @param _prizeToken       address of the token which is being auctioned.
     *                          Note: tokens must be sent to the contract separately
     *                          because you can't use transferFrom in the constructor
     *                          since you can't approve a contract address that
     *                          hasn't been created yet
     * @param _bidToken         address of the token which is being bidded with
     */
    constructor(
        uint _biddingTime,
        address _beneficiary,
        IERC20 _prizeToken,
        IERC20 _bidToken
    ) public {
        beneficiary = _beneficiary;
        auctionEndTime = block.timestamp.add(_biddingTime);
        prizeToken = _prizeToken;
        bidToken = _bidToken;
        // Need to do this so that, if someone sends
        // bidTokens to the auction before the first
        // bid, the excess tokens can be transferred
        highestBidder = _beneficiary;
    }

    /**
      * @dev Bid on the auction.
      * @param _amount  Amount of `bidToken` to bid with. Need to
      *                 approve that amount beforehand
      */
    function bid(uint256 _amount) public {
        // Revert if the bidding period is over.
        require(
            block.timestamp <= auctionEndTime,
            "Auction already ended."
        );
        // Revert if the bid isn't higher than highest
        require(
            _amount > highestBid,
            "There already is a higher bid."
        );

        uint256 bidTokenOldBal = bidToken.balanceOf(address(this));
        // If someone sends tokens to this contract outside of this fcn,
        // they will either go to the next highest bidder for potential
        // recovery, or be burned at excution
        if (bidTokenOldBal != 0) {
            // Transfer the user's tokens to bid
            // Tokens with a transfer fee not supported
            bidToken.transfer(highestBidder, bidTokenOldBal);
        }
        require(bidToken.balanceOf(address(this)) == 0, "Faulty refund");

        bidToken.transferFrom(msg.sender, address(this), _amount);
        require(bidToken.balanceOf(address(this)) == _amount, "transferFrom amount unexpected");

        highestBidder = msg.sender;
        highestBid = _amount;
        emit HighestBidIncreased(msg.sender, _amount);
    }

    /**
      * @dev    End the auction and send the highest bid
      *         to the beneficiary.
      */
    function endAuction() public {
        require(block.timestamp >= auctionEndTime, "Auction not yet ended");
        require(!ended, "AuctionEnd already been called");

        // This is to cover the edge case of someone sending tokens
        // to the contract without calling `bid`, to ensure that
        // all the bidTokens in the contract get sent. There should
        // never be a case where there are fewer tokens than `highestBid`
        uint256 bidTokenBal = bidToken.balanceOf(address(this));
        require(bidTokenBal >= highestBid, "Lost tokens somehow");

        ended = true;
        emit AuctionEnded(highestBidder, bidTokenBal);

        bidToken.transfer(beneficiary, bidTokenBal);

        uint256 prizeBal = prizeToken.balanceOf(address(this));
        prizeToken.transfer(highestBidder, prizeBal);
    }
}
