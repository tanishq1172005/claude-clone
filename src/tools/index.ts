import type { Tool } from "../types";
import {readTool} from './read'
import { bashTool } from "./bash";


export const tools:Tool[]= [bashTool,readTool]