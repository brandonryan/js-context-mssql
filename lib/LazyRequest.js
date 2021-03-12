import {Request as MssqlRequest, Transaction} from "mssql"

//Extends request to make it lazy
export class LazyRequest extends MssqlRequest {
    async query (command) {
        //make sure we have the pool
        let parent = this.parent
        if(parent instanceof Transaction) {
            parent = parent.parent
        }

        await parent.connect()
        return await super.query(command)
    }
}