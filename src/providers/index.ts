import type { Provider } from "../types";
import { createOpenAICompat } from "./openai-compat";

const providers:Record<string,()=>Provider>={
    "anthropic-openai":()=>createOpenAICompat("anthropic-openai","url",process.env.ANTHROPIC_KEY!,"claude-sonnet-5"),
    "openrouter":()=>createOpenAICompat("openrouter","https://openrouter.ai/api/v1",process.env.OPENROUTER_API_KEY!,"openrouter/free")
}

export function getProvider(name:string):Provider{
    const create = providers[name];
    if(!create){
        throw new Error("Something went wrong")
    }
    return create()
}