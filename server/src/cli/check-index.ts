import { loadQuestionIndex, parseQuestionDocument } from '../lib/question-bank/index.js'

function getLimit(): number | undefined {
  const limitArg = process.argv.find((value) => value.startsWith('--limit='))
  if (!limitArg) {
    return undefined
  }

  const parsed = Number(limitArg.split('=')[1])
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined
}

async function main() {
  const questions = await loadQuestionIndex()
  const limit = getLimit()
  const targetQuestions = limit ? questions.slice(0, limit) : questions
  const results = []

  for (const question of targetQuestions) {
    const parsed = await parseQuestionDocument(question)
    results.push({
      questionId: question.id,
      title: question.title,
      passageChunks: parsed.passageChunks.length,
      questionChunks: parsed.questionChunks.length,
      answerKeys: parsed.answerKeyChunks.length,
      answerExplanations: parsed.answerExplanationChunks.length,
      issues: parsed.qualityReport.issues
    })
  }

  const report = {
    checked: results.length,
    issues: results.filter((result) => result.issues.length > 0).length,
    results
  }

  console.log(JSON.stringify(report, null, 2))
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
