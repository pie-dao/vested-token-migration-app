// app/src/App.js
import React, { useEffect, useState } from 'react'
import { useAragonApi } from '@aragon/api-react'
import windows from "./windows.json";
import {
  Main,
  Header,
  Text,
  Table,
  TableRow,
  Card,
  TableCell,
  TableHeader,
  textStyle,
  DropDown,
  TextInput,
  Field,
  Button,
} from '@aragon/ui'
import { Contract, utils, BigNumber } from 'ethers';
import { providers } from '@aragon/api';
import { MerkleTree } from './MerkleTree';

// Calcs amount that can still be migrated at this point in time
function calcAbleToMigrate(vestingStart, vestingEnd, amount, migrated=0) {
  const timestamp = Math.floor(Date.now() / 1000);
  return BigNumber.from(amount).mul(timestamp - vestingStart).div(vestingEnd - vestingStart).sub(migrated);
}

function App() {
  const aragonAPI  = useAragonApi();
  const {connectedAccount, currentApp, appState, api, network} = aragonAPI;

  console.log(connectedAccount);

  let contract;

  // Calc leafs
  const windowsWithLeafs = windows.map(item => ({
    ...item,
    leaf: utils.solidityKeccak256(
      ["address", "uint256", "uint256", "uint256"],
      [
        item.address,
        item.amount,
        item.timestamp,
        item.vestedTimestamp
      ]
    )
  }));

  // Get my windows
  const myWindows = windowsWithLeafs.filter((value) => value.address == connectedAccount);
  const selectItems = myWindows.map(item => (`${(new Date(item.timestamp * 1000)).toLocaleString()} - ${(new Date(item.vestedTimestamp * 1000)).toLocaleString()}`));


  const [leafs, setLeafs] = useState({});
  const [selected, setSelected] = useState(0);
  const [receiver, setReceiver] = useState('');
  const [receiverValid, setReceiverValid] = useState(true);
  const [amount, setAmount] = useState(0);
  const [amountValid, setAmountValid] = useState(true);

  // Only execute this when mounting
  // TODO better handle state
  useEffect(() => {

    const fetch = async() => {
      // Get amounts already migrated
      const results = [];
      const tempLeafs = {};
  
      for (const item of myWindows) {
        const result = await api.call("amountMigratedFromWindow", item.leaf).toPromise();
        results.push(result);
        tempLeafs[item.leaf] = result      
      }

      setLeafs(tempLeafs);
      setReceiver(connectedAccount);
      setAmount(utils.formatEther(calcAbleToMigrate(myWindows[0].timestamp, myWindows[0].vestedTimestamp, myWindows[0].amount, results[0])));
    }
    fetch();
  }, [connectedAccount])

  const onReceiverChange = (event) => {
    setReceiver(event.target.value);
    setReceiverValid(utils.isAddress(event.target.value));
  }

  const onAmountChange = (event) => {
    setAmount(event.target.value);
    const weiAmount = utils.parseEther(event.target.value);
    
    const window = myWindows[selected]
    const maxAmount = calcAbleToMigrate(window.timestamp, window.vestedTimestamp, window.amount, leafs[window.leaf]);

    setAmountValid(weiAmount.lt(maxAmount));
  }

  const migrateSubmit = () => {
    // Construct merkle tree
    const merkleTree = new MerkleTree(windows.map(item => (
        utils.solidityKeccak256(
        ["address", "uint256", "uint256", "uint256"],
        [
          item.address,
          item.amount,
          item.timestamp,
          item.vestedTimestamp
        ]
      )
    )));
    const selectedWindow = myWindows[selected];

    // Create proof
    const proof = merkleTree.getProof(selectedWindow.leaf);

    console.log(api.migrateVested(receiver, utils.parseEther(amount).toString(), selectedWindow.amount, selectedWindow.timestamp, selectedWindow.vestedTimestamp, proof).toPromise().then(console.log));
  }

  // If there are no open vesting windows don't show the form
  if(myWindows.length == 0) {
    return(
      <Main>
         <img style={{maxWidth: '100%'}} src="https://raw.githubusercontent.com/pie-dao/brand/master/misc/Migration-to-stake-banner-1920-1.png"></img>
         <p style={{textAlign: 'center', fontSize: '30px', marginBottom: '20px'}}>Visit <strong>pools.piedao.org/#/dough-staking</strong> to start staking</p>
         <p style={{textAlign: 'center', fontSize: '30px', marginBottom: '20px'}}>Please connect a wallet with a DOUGHv1 balance</p>
         <img style={{maxWidth: '100%'}} src="https://raw.githubusercontent.com/pie-dao/brand/master/misc/Migration-to-stake-banner-1920-2.png"></img>
      </Main>
    )
  }

  return (
    <Main>
      <img style={{maxWidth: '100%'}} src="https://raw.githubusercontent.com/pie-dao/brand/master/misc/Migration-to-stake-banner-1920-1.png"></img>
      <p style={{textAlign: 'center', fontSize: '30px', marginBottom: '20px'}}>Visit <strong>pools.piedao.org/#/dough-staking</strong> to start staking</p>
      <Table
        header={
          <TableRow>
            <TableHeader title="Vesting Start" />
            <TableHeader title="Vesting End" />
            <TableHeader title="Total amount" />
            <TableHeader title="Amount migrated" />
            <TableHeader title="Able to migrate" />
          </TableRow>
        }
      >
      <img style={{maxWidth: '100%'}} src="https://raw.githubusercontent.com/pie-dao/brand/master/misc/Migration-to-stake-banner-1920-2.png"></img>
    {
      myWindows.map((item) => (
        <TableRow>
          <TableCell>
            <Text>{(new Date(item.timestamp * 1000)).toLocaleString()}</Text>
          </TableCell>
          <TableCell>
            <Text>{(new Date(item.vestedTimestamp * 1000)).toLocaleString()}</Text>
          </TableCell>
          <TableCell>
            <Text>{utils.formatEther(item.amount)}</Text>
          </TableCell>
          <TableCell>
          <Text>{utils.formatEther(leafs[item.leaf] || 0)}</Text>
          </TableCell>
          <TableCell>
            <Text>{utils.formatEther(calcAbleToMigrate(item.timestamp, item.vestedTimestamp, item.amount, leafs[item.leaf]))}</Text>
          </TableCell>
        </TableRow>
      ))
    }
  
   </Table>

   <Card width="100%" style={{padding: 20}}>
    <Field label="Vesting Window" style={{width: "100%"}}>
      <DropDown
          items={selectItems}
          selected={selected}
          onChange={setSelected}
          wide
      />
    </Field>
    <Field label="Receiver" style={{width: "100%"}}>
      <TextInput
        style={!receiverValid ? {borderColor: "red"} : {}}
        value={receiver}
        onChange={onReceiverChange}
        wide
      />
    </Field>
    <Field label="Amount" style={{width: "100%"}}>
      <TextInput
        style={!amountValid ? {borderColor: "red"} : {}}
        value={amount}
        onChange={onAmountChange}
        wide
      />
    </Field>

    <Button onClick={migrateSubmit} disabled={!amountValid || !receiverValid} size="large" mode="strong" wide label="Migrate"/>
   </Card>

  </Main>
  )
}

export default App