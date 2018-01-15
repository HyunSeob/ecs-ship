#!/usr/bin/env node

import * as AWS from 'aws-sdk'
import * as program from 'commander'
import * as ora from 'ora'
import chalk from 'chalk'

program
  .option('-r --region [region]')
  .option('-c --cluster [cluster]')
  .option('-s --service [service]')
  .option('-i --image [image]')
  .option('--container [container]')
  .option('--force-stop-all-tasks')
  .parse(process.argv);

[ 'region', 'cluster', 'service', 'image', 'container' ].forEach(checkParameter)

function checkParameter(name: string) {
  if (!program[name]) {
    console.error(chalk.redBright(`Error: You should specify [${name}]`))
    process.exit(9)
  }
}

(async () => {
  AWS.config.update({ region: program.region });
  const ecs = new AWS.ECS();

  const spinner = ora(`Describing service ${program.service}`).start()

  const { services } = await ecs.describeServices({
    cluster: program.cluster,
    services: [program.service]
  }).promise()

  const oldDefinition = services[0].taskDefinition
  const desiredCount = services[0].desiredCount

  spinner.text = `Describing definition: ${oldDefinition}`

  const { taskDefinition } = await ecs.describeTaskDefinition({
    taskDefinition: oldDefinition
  }).promise()

  spinner.text = `Registering new definition from image: ${program.image}`

  const newDefinition = (await ecs.registerTaskDefinition({
    family: taskDefinition.family,
    networkMode: taskDefinition.networkMode,
    volumes: taskDefinition.volumes,
    placementConstraints: taskDefinition.placementConstraints,
    containerDefinitions: taskDefinition.containerDefinitions.map((container) => {
      if (container.name === program.container) {
        container.image = program.image
      }

      return container;
    })
  }).promise()).taskDefinition

  spinner.text = `Updating service: ${program.service}`

  await ecs.updateService({
    cluster: program.cluster,
    service: program.service,
    taskDefinition: newDefinition.family + ':' + newDefinition.revision,
    desiredCount,
  }).promise()

  spinner.text = `Deregistering old task definition: ${oldDefinition}`

  await ecs.deregisterTaskDefinition({
    taskDefinition: oldDefinition
  })

  if (program.forceStopAllTasks) {
    spinner.text = `Stopping all tasks`
    const tasks = await ecs.listTasks({ cluster: program.cluster }).promise()
    await Promise.all(tasks.taskArns.map(stopTask))
  }

  spinner.stop()
  console.log(chalk.cyanBright('✨  Shipping complete!'))

  async function stopTask(taskArn) {
    return ecs.stopTask({
      task: taskArn,
      cluster: program.cluster,
      reason: `Deploy new version: ${program.image}`
    }).promise();
  }
})();
