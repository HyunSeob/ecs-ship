#!/usr/bin/env node
"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : new P(function (resolve) { resolve(result.value); }).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
const AWS = require("aws-sdk");
const program = require("commander");
const ora = require("ora");
const chalk_1 = require("chalk");
program
    .option('-r --region [region]')
    .option('-c --cluster [cluster]')
    .option('-s --service [service]')
    .option('-i --image [image]')
    .option('--container [container]')
    .option('--force-stop-all-tasks')
    .parse(process.argv);
['region', 'cluster', 'service', 'image', 'container'].forEach(checkParameter);
function checkParameter(name) {
    if (!program[name]) {
        console.error(chalk_1.default.redBright(`Error: You should specify [${name}]`));
        process.exit(9);
    }
}
(() => __awaiter(this, void 0, void 0, function* () {
    AWS.config.update({ region: program.region });
    const ecs = new AWS.ECS();
    const spinner = ora(`Describing service ${program.service}`).start();
    const { services } = yield ecs.describeServices({
        cluster: program.cluster,
        services: [program.service]
    }).promise();
    const oldDefinition = services[0].taskDefinition;
    const desiredCount = services[0].desiredCount;
    spinner.text = `Describing definition: ${oldDefinition}`;
    const { taskDefinition } = yield ecs.describeTaskDefinition({
        taskDefinition: oldDefinition
    }).promise();
    spinner.text = `Registering new definition from image: ${program.image}`;
    const newDefinition = (yield ecs.registerTaskDefinition({
        family: taskDefinition.family,
        networkMode: taskDefinition.networkMode,
        volumes: taskDefinition.volumes,
        placementConstraints: taskDefinition.placementConstraints,
        containerDefinitions: taskDefinition.containerDefinitions.map((container) => {
            if (container.name === program.container) {
                container.image = program.image;
            }
            return container;
        })
    }).promise()).taskDefinition;
    spinner.text = `Updating service: ${program.service}`;
    yield ecs.updateService({
        cluster: program.cluster,
        service: program.service,
        taskDefinition: newDefinition.family + ':' + newDefinition.revision,
        desiredCount,
    }).promise();
    spinner.text = `Deregistering old task definition: ${oldDefinition}`;
    yield ecs.deregisterTaskDefinition({
        taskDefinition: oldDefinition
    });
    if (program.forceStopAllTasks) {
        spinner.text = `Stopping all tasks`;
        const tasks = yield ecs.listTasks({ cluster: program.cluster }).promise();
        yield Promise.all(tasks.taskArns.map(stopTask));
    }
    spinner.stop();
    console.log(chalk_1.default.cyanBright('✨  Shipping complete!'));
    function stopTask(taskArn) {
        return __awaiter(this, void 0, void 0, function* () {
            return ecs.stopTask({
                task: taskArn,
                cluster: program.cluster,
                reason: `Deploy new version: ${program.image}`
            }).promise();
        });
    }
}))();
//# sourceMappingURL=index.js.map