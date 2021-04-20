import mssql from "mssql"
import {Context, ContextBuilder} from "js-context"
import {getDescriptor as getPoolDescriptor} from "./pool.js"

/** 
 * @typedef {{
 *  tx: mssql.Transaction,
 *  isolationLevel: mssql.IIsolationLevel
 *  requests: Set<mssql.Request>
 * }} txDescriptor
 */

const txSym = Symbol("mssqlTransaction")

/**
 * adds a mssql transaction to a context. The transaction will not be started until a request is created
 * @param {Context} ctx context to add the transaction to
 * @param {mssql.IIsolationLevel} [isolationLevel]
 */
export function withTx(ctx, isolationLevel) {
    //we dont do a check to see if a tx is already on the context, because it may be helpful to have multiple tx from one pool.
    const {pool} = getPoolDescriptor(ctx)

    return new ContextBuilder()
        .with(txSym, {
            tx: new mssql.Transaction(pool),
            isolationLevel,
            requests: new Set()
        })
        .withCtxFunction(getTxRequest.name, getTxRequest)
        .build(ctx)
}

export function hasTx(ctx) {
    return Boolean(ctx[txSym])
}

export async function getTxRequest(ctx) {
    const {tx, isolationLevel, requests} = getDescriptor(ctx)
    
    //lazily connect
    await tx.parent.connect()

    //lazily start the transaction
    if(!tx._acquiredConnection) {
        await tx.begin(isolationLevel)
    }

    //transaction has begun by now
    const req = new mssql.Request(tx)
    requests.add(req)
    return req
}

export async function rollback(ctx) {
    const {tx, requests} = getDescriptor(ctx)

    for(const req of requests) {
        req.cancel()
    }

    if(tx._acquiredConnection) {
        await tx.rollback()
    }
}

export async function commit(ctx) {
    const {tx} = getDescriptor(ctx)

    if(tx._acquiredConnection) {
        await tx.commit()
    }
}

/**
 * @returns {txDescriptor}
 */
function getDescriptor(ctx) {
    const desc = ctx[txSym]
    if(!desc) {
        throw new Error(`Transaction not set on context`)
    }
    return desc
}