import fs from "fs";

import { fetchEventSource } from "@waylaidwanderer/fetch-event-source";

import inquirer from "inquirer";
import chalkAnimation from "chalk-animation";
import { createSpinner } from "nanospinner";

import { exec } from "child_process";
import markdownToc from "markdown-toc";

import dotenv from "dotenv";
dotenv.config();

(async () => {
    console.clear();
    await init();
    console.clear();

    const title = await promptInput("Quin és el títol del document de recerca?", "Analitza la diversitat lingüística a les xarxes socials");
    const language = await promptLanguage("Quin és el llenguatge del document de recerca?", "Catalá (Català)");

    console.clear();
    await generateAll(title, language);
})();

async function promptInput(message, defaultInput) {
    const { input } = await inquirer.prompt([
        {
            type: "input",
            name: "input",
            message,
            default: defaultInput,
        }
    ]);
    return input;
}

async function promptLanguage(message, defaultLanguage) {
    const { language } = await inquirer.prompt([
        {
            type: "list",
            name: "language",
            message,
            choices: [
                "English",
                "Spanish (Español)",
                "French (Français)",
                "Catalá (Català)",
            ],
            default: defaultLanguage,
        }
    ]);
    return language;
}

async function init() {
    const rainbowTitle = chalkAnimation.rainbow("Generador de Treballs de Recerca | v1.0.0");

    await new Promise(resolve => setTimeout(resolve, 1000));

    rainbowTitle.stop(); return;
}

async function generateAll(title, language) {
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
        r.todo = await generateTodo(instructions);
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
            if (readError) { finalSpinner.error({ text: "Error generating final PDF document -1" }); return; }

            const cleanedData = data.replace(/^##.*- manual divisor.*$/gm, "");

            const tocContent = markdownToc(cleanedData, { depth: 3 }).content;
            const markdownWithToc = `${tocContent}\n${cleanedData}`;

            fs.writeFile(`${folder}/total.md`, markdownWithToc, (writeError) => {
                if (writeError) { finalSpinner.error({ text: "Error generating final PDF document -2" }); return; }

                exec(`markdown-pdf "${folder}/total.md" -o "${pdfFileName}" --css-path "./assets/pdf.css"`, (pdfError, stdout, stderr) => {
                    if (pdfError) { finalSpinner.error({ text: "Error generating final PDF document -3" }); console.error(stderr); return; }
                    else { finalSpinner.success({ text: "Final PDF document generated" }); return; }
                });
            });
        });
    } else { finalSpinner.success({ text: "Final PDF document generated" }); }
}

async function generateTodo(instructions) {
    const response = await fetch(process.env.LLM_BASE_URL, {
        method: "POST",
        body: JSON.stringify({
            messages: [
                {
                    role: "system",
                    content: instructions.todo
                }
            ],
            max_tokens: 2040,
            temperature: 0.7,
            model: "gpt-4o-2024-11-20",
        }),
        headers: {
            Authorization: process.env.LLM_API_KEY,
            "Content-Type": "application/json"
        }
    });

    if (!response.ok) {
        console.error("Error generating TODO:", response.statusText);
        throw new Error("Failed to generate TODO");
    }

    const data = await response.json();
    console.log(data);

    const result = data.choices[0].message.content;
    fs.writeFileSync("todo.txt", result);
    return result;
}

async function generateSection(section, route, route1, instructions, text, context) {
    const userMessage = `The title of the section is ${section}.`;

    const response = await fetch(process.env.LLM_BASE_URL, {
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
                    content: userMessage
                }
            ],
            max_tokens: 8192,
            temperature: 0.7,
            model: "gpt-4o-2024-11-20",
        }),
        headers: {
            Authorization: process.env.LLM_API_KEY,
            "Content-Type": "application/json"
        }
    });

    if (!response.ok) {
        console.error("Error generating section:", response);
        throw new Error("Failed to generate section");
    }

    const data = await response.json();
    const result = data.choices[0].message.content;

    fs.writeFileSync(route, result);
    fs.writeFileSync(route1, `${text}\n\n## ${section}  - manual divisor\n\n${result}\n`);

    context.push({ role: "user", content: userMessage });
    context.push({ role: "assistant", content: result });

    return result;
}