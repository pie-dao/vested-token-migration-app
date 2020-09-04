// app/src/script.js
import 'core-js/stable'
import 'regenerator-runtime/runtime'
import Aragon, { events } from '@aragon/api'

const app = new Aragon()


// THIS CODE MAKES NO SENSE YET

app.store(
  async (state, { event, leaf }) => {
    const nextState = {
      ...state,
    }

    try {
      switch (event) {
        case 'Increment':
          return { ...nextState, count: await getValue() }
        case 'GetLeafMigratedAmount':
          return getLeafMigratedAmount(leaf, nextState)
        case 'Decrement':
          return { ...nextState, count: await getValue() }
        case events.SYNC_STATUS_SYNCING:
          return { ...nextState, isSyncing: true }
        case events.SYNC_STATUS_SYNCED:
          return { ...nextState, isSyncing: false }
        default:
          return state
      }
    } catch (err) {
      console.log(err)
    }
  },
  {
    init: initializeState(),
  }
)

/***********************
 *   Event Handlers    *
 ***********************/

function initializeState() {
  return async cachedState => {
    return {
      ...cachedState,
      migratedAmounts: {

      },
      count: await getValue("0xf0b200b6bb6dfce7e1f13af21899dc9eef227b14c114f615c9ddab5affc6932e"),
    }
  }
}

async function getValue(leaf) {
  // Get current value from the contract by calling the public getter
  // app.call() returns a single-emission observable that we can immediately turn into a promise
  const call = await app.call('amountMigratedFromWindow', [leaf]).toPromise();
  return call;
  return parseInt(await app.call('value').toPromise(), 10)
}
