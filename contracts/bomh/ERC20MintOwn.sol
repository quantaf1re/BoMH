pragma solidity 0.5.16;


import { Ownable } from "@openzeppelin/contracts/ownership/Ownable.sol";
import { ERC20 } from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import { ERC20Detailed } from "@openzeppelin/contracts/token/ERC20/ERC20Detailed.sol";


contract ERC20MintOwn is ERC20, ERC20Detailed, Ownable {
    
    constructor(string memory name, string memory symbol) ERC20Detailed(name, symbol, 18) public {}
    
    function mint(address account, uint256 amount) public onlyOwner {
        _mint(account, amount);
    }
    
    function burn(address account, uint256 amount) public onlyOwner {
        _burn(account, amount);
    }
}