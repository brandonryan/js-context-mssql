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

const txSym = new Symbol("mssqlTransaction")

/**
 * adds a mssql transaction to a context. The transaction will not be started until a request is created
 * @param {Context} ctx context to add the transaction to
 * @param {mssql.IIsolationLevel} [isolationLevel]
 */
export async function withTx(ctx, isolationLevel) {
    //we dont do a check to see if a tx is already on the context, because it may be helpful to have multiple tx from one pool.
    const {pool} = getPoolDescriptor(ctx)
    if(!pool.connected) {
        await pool.connect()
    }

    return new ContextBuilder()
        .with(sym, {
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

    //lazily start the transaction
    //tx does not expose a (begun) variable, so we just let it error and ignore it.
    try {
        await tx.begin(isolationLevel)
    } catch (err) {
        //re-throw anything that isnt a tx already begun error
        if(err.code !== "EALREADYBEGUN") {
            throw err
        }
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

    try {
        await tx.rollback()
    } catch (err) {
        //if the transaction was never started, we can ignore it.
        if(err.code !== "ENOTBEGUN") {
            //must be EREQINPROG at this point
            //all requests should be canceled by now, so we should never get that error
            //if this ever throws its something that would need to be investigated
            throw err
        }
    }
}

export async function commit(ctx) {
    const {tx} = getDescriptor(ctx)

    try {
        await tx.commit()
    } catch (err) {
        //if the transaction was never started, we can ignore it.
        if(err.code !== "ENOTBEGUN") {
            //otherwise, the error is most likely that a request is currently in process. 
            //We want to let this bubble up because it indicates there is an async issue somewhere
            throw err
        }
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