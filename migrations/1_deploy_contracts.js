const MultisigWallet = artifacts.require("MultisigWallet");
const USDT = artifacts.require("USDT");

module.exports = function (deployer, network, accounts) {
  deployer.deploy(
    MultisigWallet,
    [accounts[1], accounts[5]],
    2,
    "0xAA40238739328b58873993FE22AE62B8f495c0ce",
    { from: accounts[5] }
  );
  // deployer.deploy(USDT, { from: accounts[5] });
};
