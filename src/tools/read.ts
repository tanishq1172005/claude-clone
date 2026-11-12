import type { Tool } from "../types";
import {readFile} from "node:fs/promises"
import {resolve} from "node:path"

export const readTool: Tool = {
    name:"read",
    description:"Read a text file and return it's content",
    parameters:{
        type:"object",
        properties:{
            path:{
                type:"string",
                description:"Path to the file, relative to the current folder"
            }
        },
        required:["path"],
    },
    async execute(args) {
        return readFile(resolve(process.cwd(),String(args.path)),"utf-8")
    },
}