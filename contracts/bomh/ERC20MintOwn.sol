pragma solidity 0.5.16;


import { Ownable } from "@openzeppelin/contracts/ownership/Ownable.sol";
import { ERC20 } from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import { ERC20Detailed } from "@openzeppelin/contracts/token/ERC20/ERC20Detailed.sol";


contract ERC20MintOwn is ERC20, ERC20Detailed, Ownable {
    
    constructor(
        string memory _name, 
        string memory _symbol, 
        uint8 _decimals
    ) ERC20Detailed(_name, _symbol, _decimals) public {}
    
    function mint(address account, uint256 amount) public onlyOwner {
        require(account != address(0), "Need to specify account");
        require(amount != 0, "Need to burn non-zero amount");
        _mint(account, amount);
    }
    
    function burn(address account, uint256 amount) public onlyOwner {
        require(account != address(0), "Need to specify account");
        require(amount != 0, "Need to burn non-zero amount");
        _burn(account, amount);
    }
}