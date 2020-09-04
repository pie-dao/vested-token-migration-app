// app/src/App.js
import React from 'react'
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
  textStyle
} from '@aragon/ui'
import { utils, BigNumber } from 'ethers';

// Calcs amount that can still be migrated at this point in time
function calcAbleToMigrate(vestingStart, vestingEnd, amount, migrated=0) {
  const timestamp = Math.floor(Date.now() / 1000);
  return BigNumber.from(amount).mul(timestamp - vestingStart).div(vestingEnd - vestingStart).sub(migrated);
}

function App() {
  const {connectedAccount, appState, api} = useAragonApi();

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
  let myWindows = windowsWithLeafs.filter((value) => value.address == connectedAccount);

  // Get amounts already migrated
  myWindows.map(item => {
    console.log(api.amountMigratedFromWindow(item.leaf));
  });

  return (
    <Main>
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
            <Text>{utils.formatEther(0)}</Text>
          </TableCell>
          <TableCell>
            <Text>{utils.formatEther(calcAbleToMigrate(item.timestamp, item.vestedTimestamp, item.amount, 0))}</Text>
          </TableCell>
        </TableRow>
      ))
    }
  
   </Table>

  </Main>
  )
}

export default App