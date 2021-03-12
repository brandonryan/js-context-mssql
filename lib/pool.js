import mssql from "mssql"
import {Context, ContextBuilder} from "js-context"
import {LazyRequest} from './LazyRequest.js'

/** 
 * @typedef {{
 *  tx: mssql.Transaction,
 *  requests: Set<mssql.Request>
 * }} poolDescriptor
 */

/** @type {Map<string, Symbol>} */
const mssqlPoolSym = Symbol("mssqlPool")

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
 * starts a request on a mssql pool.
 * @param {Context} ctx
 */
export function getRequest(ctx) {
    const {pool, requests} = getDescriptor(ctx)
    const req = new LazyRequest(pool)
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