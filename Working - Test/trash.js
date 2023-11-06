import { fetchEventSource } from "@waylaidwanderer/fetch-event-source";
import fs from "fs";
import { createSpinner } from "nanospinner";
import inquirer from "inquirer";
import chalkAnimation from "chalk-animation";
import delay from "delay";

import dotenv from "dotenv";
dotenv.config();

const url = "https://api.turing.sh/text/gpt-new";

(async () => {
    console.clear();
    await init();
    console.clear();

    let { title } = await inquirer.prompt([
        {
            type: "input",
            name: "title",
            message: "Quin és el títol del document de recerca?",
            default: "Analitza la diversitat lingüística a les xarxes socials"
        }
    ]);

    let { language } = await inquirer.prompt([
        {
            type: "list",
            name: "language",
            message: "Quin és el llenguatge del document de recerca?",
            choices: [
                "English",
                "Spanish (Español)",
                "French (Français)",
                "Catalá (Català)",
            ],
            default: "Catalá (Català)"

        }
    ]);

    console.clear();
    await generateAll(title, language);
})();

async function init() {
    const rainbowTitle = chalkAnimation.rainbow("Generador de Treballs de Recerca | v1.0.0");
    await delay(1000);
    rainbowTitle.stop();
    return;
}

async function generateAll(title, language) {
    let instructions = {
        todo: `Get all the section titles for a research paper that MUST have at least 25000 words. The paper language is ${language}. The title of the research paper is ${title}, make all the section titles related to the title. The section titles must contain 3-10 words. The section tiles must be on ${language}. You may need to add an experiment. Add titles for all the sections that a research paper needs. The limit of sections is 16 sections. The sections MUST be displayed as a list divided by a comma.  DO NOT INCLUDE ANY NUMBERS OR PUNCTUATION MARKS.`,
        section: ``
    };

    let folder = `./${title.replaceAll(" ", "_")}`;

    var r = {
        todo: "",
        text: fs.existsSync(`${folder}/total.md`) ? fs.readFileSync(`${folder}/total.md`, "utf-8") : "",
        sections: []
    };

    var context = [];

    const spinner = createSpinner("Generating section titles...").start();

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

    spinner.success({ text: `${sections.length} sections generated` });

    instructions.section = `Your task is to write a full research paper that MUST have at least 25000. The title of the research paper is ${title}. The paper language is ${language}. The user will tell you the section you need to write about. There are more sections than the ones you have written. This is the list of all the sections of the paper: ${sections.join(", ")}. YOU MUST JUST WRITE ABOUT THE SECTION THE USER TELLS YOU TO WRITE ABOUT. DO NOT INCLUDE A CONCLUSION OR INTRODUCTION ON EACH SECTION. USE MARKDOWN TO WRITE THE RESEARCH PAPER. YOU NEED TO WRITE COMPLETE SECTIONS WITH ALL THE INFORMATION REQUIRED. THE SECTION MUST HAVE AT LEAST 1500 WORDS. THE SECTION MUST BE WRITTEN ON ${language}.`;
    await delay(2000);

    if (!fs.existsSync(`${folder}/total.md`)) {
        for (let i = 0; i < sections.length; i++) {
            console.clear();
            let spinner2 = createSpinner(`Generating section ${i + 1}/${sections.length} (${sections[i]})...`).start();

            if (!fs.existsSync(`${folder}/${sections[i].replaceAll(" ", "_")}.txt`)) {
                let sectionText = await generateSection(sections[i], `${folder}/${sections[i].replaceAll(" ", "_")}.txt`, `${folder}/total.md`, instructions, r.text, context);

                r.sections.push({
                    title: sections[i],
                    text: sectionText
                });

                r.text += `\n## ${sections[i]} - manual divisor\n\n${sectionText}\n`;

                fs.writeFileSync(`${folder}/${sections[i].replaceAll(" ", "_")}.txt`, sectionText);
                fs.writeFileSync(`${folder}/total.md`, r.text);
            }

            spinner2.success({ text: `Section ${i + 1}/${sections.length} (${sections[i]}) generated` });
        }
    }
    console.clear();
}

async function generateTodo(instructions) {
    let r = "";

    await fetchEventSource(url, {
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
            model: "gpt-4",
            stream: true
        }),
        headers: {
            Authorization: process.env.TURING_API_KEY,
            "x-captcha-token": process.env.TURING_API_CAPTCHA,
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
    let u = `The title of the section is ${section}.`;
    await fetchEventSource(url, {
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
            Authorization: process.env.TURING_API_KEY,
            "x-captcha-token": process.env.TURING_API_CAPTCHA,
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
