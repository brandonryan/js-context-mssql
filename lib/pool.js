import mssql from "mssql"
import {Context, ContextBuilder} from "js-context"

/** 
 * @typedef {{
 *  tx: mssql.Transaction,
 *  requests: Set<mssql.Request>
 * }} poolDescriptor
 */

/** @type {Map<string, Symbol>} */
const mssqlPoolSym = new Symbol("mssqlPool")

/**
 * @param {Context|ContextBuilder} ctx 
 * @param {mssql.config} poolConfig
 */
export function withPool(ctx, poolConfig) {
    if(ctx[mssqlPoolSym]) {
        throw new Error("Mssql pool already established on context")
    }

    return new ContextBuilder()
        .with(mssqlPoolSym, {
            pool: new mssql.ConnectionPool(poolConfig),
            requests: new Set()
        })
        .withCtxFunction(getRequest.name, getRequest)
        .build(ctx)
        
}

/**
 * cancels any requests made from pool then closes it
 * @param {Context} ctx 
 */
export async function closePool(ctx) {
    const {requests, pool} = getDescriptor(ctx)
    for(const req of requests) {
        req.cancel()
    }
    await pool.close()
}

/**
 * starts a request on a mssql pool and connects it if not connected.
 * @param {Context} ctx
 */
export async function getRequest(ctx) {
    const {pool, requests} = await getDescriptor(ctx)
    if(!pool.connected) {
        await pool.connect()
    }
    const req = new Request(pool)
    requests.add(req)
    return req
}

/**
 * Note: do not export to client
 * @returns {poolDescriptor}
 */
export function getDescriptor(ctx) {
    const desc = ctx[mssqlPoolSym]
    if(!desc) {
        throw new Error("Pool not set on context")
    }
    return desc
}