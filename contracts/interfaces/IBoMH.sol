pragma solidity 0.5.16;


import { MassetStructs } from "../masset/shared/MassetStructs.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";


interface IBoMH {
    
    function deposit(IERC20 _basset, uint256 _bassetQuantity) external;
    
    function withdraw(uint256 _mhUSDAmount) external;
    
    function cashOut() external;
    
    function mhCoinBurn() external;

    function getReserveTokens() external view returns (IERC20[] memory tokens);
    
}
