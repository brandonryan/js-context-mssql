import mssql from "mssql"

//Extends request to make it lazy
export class LazyRequest extends mssql.Request {
    async query (command) {
        //make sure we have the pool
        let parent = this.parent
        if(parent instanceof mssql.Transaction) {
            parent = parent.parent
        }

        await parent.connect()
        return await super.query(command)
    }
}