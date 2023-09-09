const MultiSigWallet = artifacts.require("MultisigWallet");
const USDT = artifacts.require("USDT");
const { ethers } = require("ethers");

contract("MultisigWallet", (accounts) => {
  let walletInstance;
  let USDTinstance;
  const provider = new ethers.JsonRpcProvider("http://127.0.0.1:7545");
  beforeEach(async () => {
    USDTinstance = await USDT.new({ from: accounts[5] });
    walletInstance = await MultiSigWallet.new(
      [accounts[0], accounts[1], accounts[2]],
      2,
      USDTinstance.address
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
    assert.deepEqual(dataFromBC, requiredData, "should be equal");
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
    assert.deepEqual(dataFromBC, requiredData, "should be equal");
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
  });
  it("should change the number of confirmations required", async () => {
    let ABI = ["function changeRequirement(uint256 arg1)"];
    await walletInstance.createChangeRequirementTxn(2, {
      from: accounts[0],
    });
    const iface = new ethers.Interface(ABI);
    const signature = iface.encodeFunctionData(ABI[0], [2]);
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
    assert.deepEqual(dataFromBC, requiredData, "should be equal");
    await walletInstance.confirmTransaction(0, { from: accounts[1] });
    const transactionDetailsg = await walletInstance.getTransaction(0);
    assert.equal(
      Number(transactionDetailsg.numConfirmations),
      2,
      "should be 2"
    );
    assert.deepEqual(
      Number(await walletInstance.numConfirmationsRequired()),
      2,
      "should be 2"
    );
  });

  it("should approve and transfer usdt", async () => {
    let ABI = ["function transferUSDT(address arg1,uint256 arg2)"];
    await USDTinstance.transfer(walletInstance.address, 10000, {
      from: accounts[5],
    });
    await walletInstance.createApproveTxn(accounts[7], 1000, {
      from: accounts[0],
    });
    const iface = new ethers.Interface(ABI);
    const signature = iface.encodeFunctionData(ABI[0], [accounts[7], 1000]);
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
    assert.deepEqual(dataFromBC, requiredData, "should be equal");
    await walletInstance.confirmTransaction(0, { from: accounts[1] });
    const transactionDetailsg = await walletInstance.getTransaction(0);
    assert.equal(
      Number(transactionDetailsg.numConfirmations),
      2,
      "should be 2"
    );
    assert.deepEqual(
      Number(await USDTinstance.balanceOf(accounts[7])),
      1000,
      "should be 1000"
    );
  });

  it("should create unpause request, confirm and unpause the contract", async () => {
    await walletInstance.pause({ from: accounts[0] });
    await walletInstance.createUnpauseTxn({ from: accounts[0] });
    await walletInstance.createUnpauseTxn({ from: accounts[1] });
    assert.equal(
      await walletInstance.paused(),
      false,
      "Should unpause the contract"
    );
  });

  it("should withraw usdt from contract", async () => {
    await walletInstance.pause({ from: accounts[0] });
    await USDTinstance.transfer(walletInstance.address, 10000, {
      from: accounts[5],
    });
    await walletInstance.emergencyWithdraw(accounts[1], 10000, {
      from: accounts[0],
    });
    assert.equal(
      Number(await USDTinstance.balanceOf(walletInstance.address)),
      0,
      "All balances should be withdrawn"
    );
  });
  it("should withraw ETH from contract", async () => {
    await walletInstance.pause({ from: accounts[0] });
    const depositAmount = ethers.parseUnits("0.00000001", "ether");
    const signer = await provider.getSigner(accounts[3]);
    await signer.sendTransaction({
      from: accounts[3],
      to: walletInstance.address,
      value: depositAmount,
    });
    const newBalance = await provider.getBalance(walletInstance.address);
    assert.equal(
      newBalance,
      depositAmount,
      "Balance should increase by deposit amount"
    );
    await walletInstance.emergencyWithdrawETH(
      accounts[1],
      depositAmount.toString(),
      {
        from: accounts[0],
      }
    );
    assert.equal(
      Number(await provider.getBalance(walletInstance.address)),
      0,
      "All balances should be withdrawn"
    );
  });
});
