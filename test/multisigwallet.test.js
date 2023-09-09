const MultiSigWallet = artifacts.require("MultisigWallet");
const { ethers } = require("ethers");

contract("MultisigWallet", (accounts) => {
  let walletInstance;
  const provider = new ethers.JsonRpcProvider("http://127.0.0.1:7545");

  beforeEach(async () => {
    walletInstance = await MultiSigWallet.new(
      [accounts[0], accounts[1], accounts[2]],
      2,
      "0x0583aF2aC650f95ce3254242C55Bc7c8ad897F00"
    );
  });
  it("should deposit funds", async () => {
    const initialBalance = await provider.getBalance(walletInstance.address);
    const depositAmount = ethers.parseUnits("1", "ether");
    const signer = await provider.getSigner(accounts[3]);
    await signer.sendTransaction({
      from: accounts[3],
      to: walletInstance.address,
      value: depositAmount,
    });
    const newBalance = await provider.getBalance(walletInstance.address);
    assert.equal(
      newBalance - initialBalance,
      depositAmount,
      "Balance should increase by deposit amount"
    );
  });
  it("should pause the contract", async () => {
    await walletInstance.pause({ from: accounts[0] });
    assert.equal(
      await walletInstance.paused(),
      true,
      "Contract paused state should be true"
    );
  });
  it("should create add owner request, increase confirmation by 1 and add owner", async () => {
    let ABI = ["function addOwner(address arg1)"];
    await walletInstance.createAddOwnerTxn(accounts[5], {
      from: accounts[0],
    });
    const iface = new ethers.Interface(ABI);
    const signature = iface.encodeFunctionData(ABI[0], [accounts[5]]);
    const transactionDetails = await walletInstance.getTransaction(0);
    const dataFromBC = {
      to: transactionDetails.to,
      data: transactionDetails.data,
      executed: transactionDetails.executed,
      numConfirmations: Number(transactionDetails.numConfirmations),
    };
    const requiredData = {
      to: walletInstance.address,
      data: signature,
      executed: false,
      numConfirmations: 1,
    };
    await walletInstance.confirmTransaction(0, { from: accounts[1] });
    const transactionDetailsg = await walletInstance.getTransaction(0);
    assert.equal(
      Number(transactionDetailsg.numConfirmations),
      2,
      "should be 2"
    );
    assert.deepEqual(
      await walletInstance.getOwners(),
      [accounts[0], accounts[1], accounts[2], accounts[5]],
      "account 0, 1 and 5 must be owners"
    );
    assert.deepEqual(dataFromBC, requiredData, "should be equal");
  });
  it("should create remove owner request,confirm the transaction and remove the owner", async () => {
    let ABI = ["function removeOwner(address arg1)"];
    await walletInstance.createRemoveOwnerTxn(accounts[0], {
      from: accounts[0],
    });
    const iface = new ethers.Interface(ABI);
    const signature = iface.encodeFunctionData(ABI[0], [accounts[0]]);
    const transactionDetails = await walletInstance.getTransaction(0);
    const dataFromBC = {
      to: transactionDetails.to,
      data: transactionDetails.data,
      executed: transactionDetails.executed,
      numConfirmations: Number(transactionDetails.numConfirmations),
    };
    const requiredData = {
      to: walletInstance.address,
      data: signature,
      executed: false,
      numConfirmations: 1,
    };
    await walletInstance.confirmTransaction(0, { from: accounts[1] });
    const transactionDetailsg = await walletInstance.getTransaction(0);
    assert.equal(
      Number(transactionDetailsg.numConfirmations),
      2,
      "should be 2"
    );
    assert.deepEqual(
      await walletInstance.getOwners(),
      [accounts[2], accounts[1]],
      "account 1 and 2 must be owners"
    );
    assert.deepEqual(dataFromBC, requiredData, "should be equal");
  });
});
