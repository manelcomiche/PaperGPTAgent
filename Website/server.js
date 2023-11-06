import fs from "fs";

import * as fsextra from "fs-extra";

import { fetchEventSource } from "@waylaidwanderer/fetch-event-source";

import { createSpinner } from "nanospinner";

import { exec } from "child_process";
import markdownToc from "markdown-toc";

import dotenv from "dotenv";
dotenv.config();

import Fastify from "fastify";
const fastify = Fastify({ logger: true });

import staticPlugin from "fastify-static";

import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);


fastify.register(staticPlugin, {
    root: path.join(__dirname, 'public'),
    prefix: '/public/',
});

fastify.get('/', async (request, reply) => {
    return reply.sendFile('index.html');
});

fastify.post('/generate-pdf', async (request, reply) => {
    const { title, language, token } = request.body;

    if (!title || !language || !token) {
        return reply.status(400).send({ error: "Invalid input" });
    }

    await generateAll(title, language, token);

    async function moveDirectory(source, destination) {
        try {
            await fsextra.copy(source, destination);
            await fsextra.remove(source);
            console.log("Carpeta movida exitosamente.");
        } catch (err) {
            console.error("Error al mover la carpeta:", err);
        }
    }

    const oldPath = `./${title.replaceAll(" ", "_")}`;
    const newPath = path.join(__dirname, 'public', title.replaceAll(" ", "_"));
    await moveDirectory(oldPath, newPath);

    const pdfPath = `/${title.replaceAll(" ", "_")}/total.pdf`;
    return reply.send({ success: true, url: pdfPath });
});

async function generateAll(title, language, token) {
    const instructions = {
        todo: `Get all the section titles for a research paper that MUST have at least 25000 words. The paper language is ${language}. The title of the research paper is ${title}, make all the section titles related to the title. The section titles must contain 3-10 words. The section tiles must be on ${language}. You may need to add an experiment. Add titles for all the sections that a research paper needs. The limit of sections is 16 sections. The sections MUST be displayed as a list divided by a comma.  DO NOT INCLUDE ANY NUMBERS OR PUNCTUATION MARKS.`,
        section: ``
    };

    const folder = `./${title.replaceAll(" ", "_")}`;

    const r = {
        todo: "",
        text: fs.existsSync(`${folder}/total.md`) ? fs.readFileSync(`${folder}/total.md`, "utf-8") : "",
        sections: []
    };

    const context = [];

    const sectionsSpinner = createSpinner("Generating section titles...").start();

    if (!fs.existsSync(folder)) { fs.mkdirSync(folder); }

    if (!fs.existsSync(`${folder}/todo.txt`)) {
        fs.writeFileSync(`${folder}/todo.txt`, r.todo);
        r.todo = await generateTodo(instructions, token);
        fs.writeFileSync(`${folder}/todo.txt`, r.todo);
    } else { r.todo = fs.readFileSync(`${folder}/todo.txt`, "utf-8"); }

    console.log(r.todo);

    let sections = r.todo.split(",");
    sections = sections.map((s) => s.trim());
    sections = sections.map((s) => s.replaceAll(":", '-'));

    sectionsSpinner.success({ text: `${sections.length} sections generated` });

    instructions.section = `Your task is to write a full research paper that MUST have at least 25000. The title of the research paper is ${title}. The paper language is ${language}. The user will tell you the section you need to write about. There are more sections than the ones you have written. This is the list of all the sections of the paper: ${sections.join(", ")}. YOU MUST JUST WRITE ABOUT THE SECTION THE USER TELLS YOU TO WRITE ABOUT. DO NOT INCLUDE A CONCLUSION OR INTRODUCTION ON EACH SECTION. USE MARKDOWN TO WRITE THE RESEARCH PAPER. YOU NEED TO WRITE COMPLETE SECTIONS WITH ALL THE INFORMATION REQUIRED. THE SECTION MUST HAVE AT LEAST 1500 WORDS. THE SECTION MUST BE WRITTEN ON ${language}.`;
    await new Promise(resolve => setTimeout(resolve, 2000));

    for (let i = 0; i < sections.length; i++) {
        console.clear();
        const generatingSpinner = createSpinner(`Generating section ${i + 1}/${sections.length} (${sections[i]})...`).start();

        if (!fs.existsSync(`${folder}/${sections[i].replaceAll(" ", "_")}.txt`)) {
            const sectionText = await generateSection(sections[i], `${folder}/${sections[i].replaceAll(" ", "_")}.txt`, `${folder}/total.md`, instructions, r.text, context);

            r.sections.push({ title: sections[i], text: sectionText });

            r.text += `\n## ${sections[i]} - manual divisor\n\n${sectionText}\n`;

            fs.writeFileSync(`${folder}/${sections[i].replaceAll(" ", "_")}.txt`, sectionText);
            fs.writeFileSync(`${folder}/total.md`, r.text);
        }

        generatingSpinner.success({ text: `Section ${i + 1}/${sections.length} (${sections[i]}) generated` });
    }

    console.clear();

    const finalSpinner = createSpinner("Generating final PDF document...").start();
    const pdfFileName = `${folder}/total.pdf`;

    if (!fs.existsSync(pdfFileName)) {
        fs.readFile(`${folder}/total.md`, "utf-8", (readError, data) => {
            if (readError) { finalSpinner.error({ text: "Error generating final PDF document" }); return; }

            const cleanedData = data.replace(/^##.*- manual divisor.*$/gm, "");

            const tocContent = markdownToc(cleanedData, { depth: 3 }).content;
            const markdownWithToc = `${tocContent}\n${cleanedData}`;

            fs.writeFile(`${folder}/total.md`, markdownWithToc, (writeError) => {
                if (writeError) { finalSpinner.error({ text: "Error generating final PDF document" }); return; }

                exec(`markdown-pdf "${folder}/total.md" -o "${pdfFileName}" --css-path "./assets/pdf.css"`, (pdfError, stdout, stderr) => {
                    if (pdfError) { finalSpinner.error({ text: "Error generating final PDF document" }); return; }
                    else { finalSpinner.success({ text: "Final PDF document generated" }); return; }
                });
            });
        });
    } else { finalSpinner.success({ text: "Final PDF document generated" }); }
}

async function generateTodo(instructions, token) {
    let r = "";

    await fetchEventSource(process.env.TURING_BASE_URL, {
        method: "POST",
        body: JSON.stringify({
            messages: [
                {
                    role: "system",
                    content: instructions.todo
                }
            ],
            max_tokens: 2040,
            temperature: 0.4,
            model: "gpt-3.5-turbo-16k",
            stream: true
        }),
        headers: {
            Authorization: token,
            "Content-Type": "application/json"
        },

        async onopen(response) {
            if (response.ok) { return console.log("Connection established."); }
            else if (response.status >= 400 && response.status < 500 && response.status !== 429) {
                console.log("Connection failed.");
                console.log(response);
            } else { console.log("ERROR"); }
        },

        onclose() { },

        onerror(err) { console.error(err); },

        onmessage: (event) => {
            let data = JSON.parse(event.data);
            r = data.result;
            fs.writeFileSync("todo.txt", r);
        }
    });

    return r;
}

async function generateSection(section, route, route1, instructions, text, context) {
    let res = "";

    const u = `The title of the section is ${section}.`;

    await fetchEventSource(process.env.TURING_BASE_URL, {
        method: "POST",
        body: JSON.stringify({
            messages: [
                {
                    role: "system",
                    content: instructions.section
                },
                ...context,
                {
                    role: "user",
                    content: u
                }
            ],
            max_tokens: 4096,
            temperature: 0.7,
            model: "gpt-3.5-turbo-16k",
            stream: true
        }),
        headers: {
            Authorization: token,
            "Content-Type": "application/json"
        },

        async onopen(response) {
            if (response.ok) { return console.log("Connection established."); }
            else if (response.status >= 400 && response.status < 500 && response.status !== 429) {
                console.log("Connection failed.");
                console.log(response);
            } else { console.log("ERROR 1"); }
        },

        onclose() { console.log("ERROR 2"); },

        onerror(err) { console.error(err); },

        onmessage: (event) => {
            let data = JSON.parse(event.data);
            res = data.result;

            fs.writeFileSync(route, res);
            fs.writeFileSync(route1, `${text}\n\n## ${section}  - manual divisor\n\n${res}\n`);
        }
    });

    context.push({ role: "user", content: u });
    context.push({ role: "assistant", content: res });

    return res;
}

const start = async () => {
    try {
        await fastify.listen(3000);
        fastify.log.info(`server listening on 3000`);
    } catch (err) {
        fastify.log.error(err);
        process.exit(1);
    }
}

start();