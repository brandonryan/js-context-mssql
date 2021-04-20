import mssql from "mssql"

//Extends request to make it lazy
export class LazyRequest extends mssql.Request {
    constructor(parent, isolationLevel) {
        super(parent)
        this.isolationLevel = isolationLevel
    }

    async query (...args) {
        //make sure we have the pool
        let pool = this.parent
        let tx = null
        if(pool instanceof mssql.Transaction) {
            tx = pool
            pool = pool.parent
        }
        
        await pool.connect()
        if(tx && !tx._acquiredConnection) {
            await parent.begin(this.isolationLevel)
        }

        return await super.query(...args)
    }
}