import { Octokit } from '@octokit/rest'
import { RequestError } from '@octokit/request-error'
import {
  CrashlyticsEvent,
  Issue,
} from 'firebase-functions/v2/alerts/crashlytics'
import { logger } from 'firebase-functions/v2'
import { CrashlyticsAlert } from './crashlytics_alert'

const octokit = new Octokit({
  auth: process.env.GITHUB_ACCESS_TOKEN,
})

type CrashlyticsInfo<T> = {
  event: CrashlyticsEvent<T>
  issue: Issue
}

// ref. https://docs.github.com/ja/rest/issues/issues?apiVersion=2022-11-28#create-an-issue
export async function createGitHubIssueIfEnabled<T>(info: CrashlyticsInfo<T>) {
  const alertType = info.event.alertType.split('.').at(-1) as CrashlyticsAlert
  if (!process.env.ALERTS?.split(',').includes(alertType)) {
    logger.info(
      `Skip the creation of a GitHub issue because ${alertType} alert is not enabled`
    )
    return
  }

  try {
    await octokit.rest.issues.create({
      owner: process.env.GITHUB_OWNER!,
      repo: process.env.GITHUB_REPO!,
      title: info.issue.title,
      body: makeBody(info, alertType),
      labels: process.env.GITHUB_LABELS?.split(','),
    })
  } catch (error) {
    if (error instanceof RequestError) {
      if (error.status) {
        // handle Octokit error
        // see https://github.com/octokit/request-error.js
        logger.error(error.message)
      }
    }
    // handle all other errors
    logger.error(error, { structuredData: true })
    throw error
  }
}

function makeBody<T>(info: CrashlyticsInfo<T>, alertType: CrashlyticsAlert) {
  const { event, issue } = info
  logger.info(event, { structuredData: true })
  // TODO(tsuruoka): 本来はURLリンクを載せたいものの、`packageName`が取得できず`appId`のみなのでURLを生成できない問題
  // フォーマットは以下であることを確認したので、`packageName`が取得できるようになったらURLも表示できる
  // https://console.firebase.google.com/project/[PROJECT_ID]/crashlytics/app/[OS]:[PACKAGE_NAME]/issues/[ISSUE_ID]?time=last-seven-days
  const appId = event.appId
  return `
  ### ${issue.subtitle}

  | Info | Value |
  |--------|--------|
  | appId | ${appId} |
  | alertType | ${alertType} |
  | id | ${issue.id} |
  | appVersion | ${issue.appVersion} |
  `
}
