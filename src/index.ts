import dotenv from 'dotenv'
import { parseArgs } from 'node:util'
import { getProvider } from './providers'
import type { AssistantMessage, Message } from './types'
import { readTool } from './tools/read'
import { runAgent } from './agent/loop'
import { fileURLToPath } from 'node:url'


dotenv.config({
  path: fileURLToPath(new URL("../.env", import.meta.url)),
  quiet: true,
});

const tools = [readTool]

const {values} = parseArgs({
    options:{
        prompt:{type:"string",short:"p"},
        provider:{type:"string",default:"openrouter"},
        model:{type:"string",default:"openrouter/free"}
    }
})

if (!values.prompt){
    console.error("No input")
    process.exit(1)
}

const provider = getProvider(values.provider)
const model = values.model ?? provider.model;
const message:Message[] = [{role:"user",content:values.prompt}]

await runAgent({
    provider,
    model,
    tools,
    messages:message,
    onEvent(event){
        if (event.type === "text") process.stdout.write(event.delta);
        else if (event.type == "tool_start") console.log(`\n ${event.call.name}`);
        else if (event.type == "tool_end"){
            const lines = event.result.split("\n").length;
            console.log(`\n ${event.isError? event.result : lines}`)
        }else if(event.type == "turn_end"){
            const {usage,stopReason} = event.message;
            console.log(`\n\n ${provider.name} ... ${model} ... ${usage.input} ... ${usage.output} ... ${stopReason}`)
        }
    }
})

async function callModel():Promise<AssistantMessage>{
    for await (const event of provider.stream({messages:message,model,tools})){
        if(event.type === "text_delta") process.stdout.write(event.delta);
        else{
            const {usage, stopReason} = event.message
            console.log(`\n \n ${provider.name}... ${model} ... ${usage.input} ... ${usage.output} ... ${stopReason}`)
            return event.message
        }
    }
    throw new Error("Stream ended without a done event")    
}

// const first = await callModel()
// message.push(first)

// if (first.stopReason === "toolUse"){
//     for (const block of first.content){
//         if (block.type !== "toolCall") continue;
//         console.log(`${block.name}(${JSON.stringify(block.arguments)})`);
//         const result = await readTool.execute(block.arguments)
//         message.push({"role":"toolResult",toolCallId:block.id,toolName:block.name,content:result,isError:false})
//     }

//     message.push(await callModel())
// }


// // for await (const event of provider.stream({messages:message,model})){
// //     if(event.type === "text_delta") process.stdout.write(event.delta);
// //     else{
// //         const {usage,stopReason} = event.message
// //         console.log(`\n \n ${provider.name}... ${model} ... ${usage.input} ... ${usage.output} ... ${stopReason}`)
// //     }
// // }
// // const client = new OpenAI({
// //     baseURL: "https://openrouter.ai/api/v1",
// //     apiKey:process.env.OPENROUTER_API_KEY,
// // })

// // const stream = await client.chat.completions.create({
// //     model: values.model,
// //     messages:[
// //         {
// //             role:"user",
// //             content:values.prompt
// //         }
// //     ],
// //     stream:true
// // })

// // for await (const event of stream){
// //     console.log(event)
// // }

