const express = require('express');
const router = express.Router();
const { success, error, notImplemented } = require('../utils/responseFormatter');
const authController = require('../controllers/authController');
const userAuthController = require('../controllers/userAuthController');
const testController = require('../controllers/testController');
const questionController = require('../controllers/questionController');
const examController = require('../controllers/examController');
const testDraftController = require('../controllers/testDraftController');
const SubmissionQueue = require('../models/SubmissionQueue');

const SUBMISSION_MODE = process.env.SUBMISSION_MODE || 'direct';
const isDev = process.env.NODE_ENV !== 'production';

// Health check
router.get('/health', (req, res) => {
  res.json(success({ status: 'ok', message: 'MeritOn Backend is running' }));
});

// GET /api?action=...
router.get('/', async (req, res) => {
  const action = req.query.action;
  await handleAction(action, req, res, 'get');
});

// POST /api
router.post('/', async (req, res) => {
  // We'll handle the upload action separately
  const action = req.query.action || (req.body && req.body.action);
  if (action === 'uploadQuestionImage') {
    // For upload, we do not parse the body as JSON; we pass the raw request to the controller
    // which will handle multipart parsing with multer.
    await handleAction(action, req, res, 'post');
    return;
  }

  // For all other actions, we parse the body as JSON (if it's a string)
  let parsedBody = req.body;
  if (typeof parsedBody === 'string') {
    try {
      parsedBody = JSON.parse(parsedBody);
    } catch (e) {}
  }

  // Attach parsed body to req for handleAction
  req.parsedBody = parsedBody;

  const bodyAction = parsedBody.action;
  await handleAction(bodyAction, req, res, 'post');
});

const TestPaper = require('../models/TestPaper');
const Test = require('../models/Test');
const testPaperUtils = require('../utils/testPaperUtils');

// Handle all actions
const handleAction = async (action, req, res, method) => {
  if (!action) {
    res.json(error('Action is required'));
    return;
  }

  // Use parsedBody for POST, req.body for others
  const data = method === 'post' && req.parsedBody ? req.parsedBody : req.body;

  let result;
  try {
    switch (action) {
      // Health check
      case 'health':
        res.json(success({ status: 'ok' }));
        break;

      case 'debugTestPaperCandidateFlow':
        if (process.env.DEBUG_ENDPOINTS !== 'true') {
          res.json(error('Debug endpoints disabled'));
          return;
        }
        const testId = req.query.testId;
        const testPaper = await TestPaper.findOne({ TestID: testId }).lean();
        const legacyTest = await Test.findOne({ TestID: testId }).lean();
        let legacyShapeSample = null;
        if (testPaper) {
          legacyShapeSample = testPaperUtils.convertTestPaperToLegacyTest(testPaper);
        }
        res.json(success({
          testPaperFound: !!testPaper,
          legacyTestFound: !!legacyTest,
          questionCount: testPaper ? testPaper.questions.length : null,
          legacyShapeSample,
          candidateTestsCanSee: !!testPaper || !!legacyTest
        }));
        return;

      // Admin auth actions
      case 'verifyAdmin':
        result = await authController.verifyAdmin(req.query.sessionToken || data.sessionToken);
        res.json(result);
        break;

      case 'adminLogin':
        result = await authController.adminLogin(data.username, data.password);
        res.json(result);
        break;

      case 'logoutSession':
        result = await authController.logoutSession(data.sessionToken);
        res.json(result);
        break;

      // User auth actions
      case 'sendOTP':
        result = await userAuthController.sendOTP(data.email, data.type);
        res.json(result);
        break;

      case 'registerUser':
        result = await userAuthController.registerUser(data);
        res.json(result);
        break;

      case 'loginUser':
        result = await userAuthController.loginUser(data.email, data.password, data.ip);
        res.json(result);
        break;

      case 'forgotPassword':
        result = await userAuthController.forgotPassword(data.identifier);
        res.json(result);
        break;

      case 'resetPassword':
        result = await userAuthController.resetPassword(data.identifier, data.otp, data.newPassword);
        res.json(result);
        break;

      // Test management actions
      case 'getAllTests':
        result = await testController.getAllTests(req.query);
        res.json(result);
        break;

      case 'createTest':
        const createData = data.testData || data;
        result = await testController.createTest(createData, data.sessionToken);
        res.json(result);
        break;

      case 'updateTest':
        const updateData = data.testData || data;
        result = await testController.updateTest(data.testId, updateData, data.sessionToken);
        res.json(result);
        break;

      case 'deleteTest':
        result = await testController.deleteTest(data.testId, data.sessionToken, data.permanent);
        res.json(result);
        break;

      case 'publishAnswerKey':
        result = await testController.publishAnswerKey(data.testId, data.sessionToken);
        res.json(result);
        break;

      case 'getTestConfig':
        result = await testController.getTestConfig(req.query.testId || data.testId, req.query.sessionToken || data.sessionToken);
        res.json(result);
        break;

      case 'importCsvQuestions':
        result = await testController.importCsvQuestions(data, data.sessionToken);
        res.json(result);
        break;

      case 'sendExamNotification':
        result = await testController.sendExamNotification(req, data);
        res.json(result);
        break;

      // Test Draft actions
      case 'saveTestDraft':
        result = await testDraftController.saveTestDraft(data, data.sessionToken);
        res.json(result);
        break;

      case 'getTestDrafts':
        result = await testDraftController.getTestDrafts(req.query.sessionToken || data.sessionToken);
        res.json(result);
        break;

      case 'getTestDraft':
        result = await testDraftController.getTestDraft(req.query.DraftID || data.DraftID, req.query.sessionToken || data.sessionToken);
        res.json(result);
        break;

      case 'deleteTestDraft':
        result = await testDraftController.deleteTestDraft(data.DraftID, data.sessionToken);
        res.json(result);
        break;

      case 'commitDraftToTest':
        result = await testDraftController.commitDraftToTest(data.DraftID, data.testId, data.sessionToken);
        res.json(result);
        break;

      // Question management actions
      case 'getQuestions':
        result = await questionController.getQuestions(
          req.query.testId || data.testId,
          req.query.includeAnswers === 'true' || data.includeAnswers === true || data.includeAnswers === 'true',
          req.query.sessionToken || data.sessionToken,
          req
        );
        res.json(result);
        break;

      case 'getAnswers':
        result = await questionController.getAnswers(
          req.query.testId || data.testId,
          req
        );
        res.json(result);
        break;

      case 'getAllUsers':
        result = await userAuthController.getAllUsers(
          req.query.sessionToken || data.sessionToken
        );
        res.json(result);
        break;

      case 'getMalpracticeLogs':
        result = await examController.getMalpracticeLogs(
          req.query,
          req.query.sessionToken || data.sessionToken
        );
        res.json(result);
        break;

      case 'getMasterAnalytics':
        result = await examController.getMasterAnalytics(req, data);
        res.json(result);
        break;

      case 'addQuestions':
        result = await questionController.addQuestions(
          data.testId,
          data.questions,
          data.sessionToken
        );
        res.json(result);
        break;

      case 'updateQuestion':
        result = await questionController.updateQuestion(
          data.testId,
          data.qid,
          data,
          data.sessionToken
        );
        res.json(result);
        break;

      case 'deleteQuestion':
        result = await questionController.deleteQuestion(
          data.testId,
          data.qid,
          data.sessionToken,
          data.permanent
        );
        res.json(result);
        break;

      case 'bulkUpdateQuestions':
        result = await questionController.bulkUpdateQuestions(data);
        res.json(result);
        break;

      // New action: upload question image
      case 'uploadQuestionImage':
        result = await questionController.uploadQuestionImage(req);
        res.json(result);
        break;

      // Exam / Analytics actions
      case 'getResults':
        result = await examController.getResults(req.query, req.query.sessionToken);
        res.json(result);
        break;

      case 'getStudentCareerPath':
        result = await examController.getStudentCareerPath(data, req.query.sessionToken || data.sessionToken);
        res.json(result);
        break;

      case 'getMyCareerPath':
        result = await examController.getMyCareerPath(data, req.query.sessionToken || data.sessionToken);
        res.json(result);
        break;

      case 'getPerformance':
        const perfData = method === 'post' && req.parsedBody ? req.parsedBody : req.query;
        const perfSession = req.query.sessionToken || data.sessionToken;
        result = await examController.getPerformance(perfData, perfSession);
        res.json(result);
        break;

      case 'getResponses':
        const respData = method === 'post' && req.parsedBody ? req.parsedBody : req.query;
        const respSession = req.query.sessionToken || data.sessionToken;
        result = await examController.getResponses(respData, respSession);
        res.json(result);
        break;

      case 'getCandidateAnalytics':
        result = await examController.getCandidateAnalytics(req.query.userID || req.query.userId);
        res.json(result);
        break;

      case 'getLeaderboard':
        result = await examController.getLeaderboard(req.query, req.query.sessionToken || data.sessionToken);
        res.json(result);
        break;

      case 'getCandidateTests':
        result = await examController.getCandidateTests(req.query);
        res.json(result);
        break;

      case 'getCandidateOverallLeaderboard':
        result = await examController.getCandidateOverallLeaderboard(req.query, req.query.sessionToken || data.sessionToken);
        res.json(result);
        break;

      case 'getLiveTestLeaderboard':
        result = await examController.getLiveTestLeaderboard(req.query, req.query.sessionToken || data.sessionToken);
        res.json(result);
        break;

      case 'startExamSession':
        result = await examController.startExamSession(data, req.query.sessionToken || data.sessionToken);
        res.json(result);
        break;

      case 'examHeartbeat':
        result = await examController.examHeartbeat(data, req.query.sessionToken || data.sessionToken);
        res.json(result);
        break;

      case 'getLiveExamSessionLeaderboard':
        result = await examController.getLiveExamSessionLeaderboard(req.query, req.query.sessionToken || data.sessionToken);
        res.json(result);
        break;

      case 'toggleLiveLeaderboard':
        result = await examController.toggleLiveLeaderboard(data, data.sessionToken);
        res.json(result);
        break;

      case 'submitTest':
        if (SUBMISSION_MODE === 'queue') {
          console.log('[API] Queuing submission for user:', data.userID, 'test:', data.TestId);
          try {
            const existing = await SubmissionQueue.findOne({ userID: data.userID, TestId: data.TestId });
            if (existing) {
              if (existing.status === 'completed' || existing.status === 'failed') {
                res.json({ success: false, error: 'Submission already exists' });
              } else {
                res.json({ success: false, error: 'Submission already received and processing' });
              }
              break;
            }
            const queueEntry = await SubmissionQueue.create({
              userID: data.userID,
              TestId: data.TestId,
              payload: data,
              status: 'pending'
            });

            console.log('[API] Queued submission queueId:', queueEntry.queueId);
            res.json({
              success: true,
              queued: true,
              queueId: queueEntry.queueId,
              message: 'Submission received and queued'
            });
          } catch (err) {
            if (err.code === 11000) {
              const now = new Date();
              await SubmissionQueue.updateOne(
                { userID: data.userID, TestId: data.TestId },
                { status: 'duplicate', processedAt: now, expiresAt: new Date(now.getTime() + 24 * 60 * 60 * 1000) }
              );
              res.json({ success: false, error: 'Submission already received' });
            } else {
              res.json({ success: false, error: err.message });
            }
          }
        } else {
          result = await examController.submitTest(data);
          res.json(result);
        }
        break;

      case 'getSubmissionStatus':
        try {
          const queueId = req.query.queueId || data.queueId;
          if (!queueId) {
            res.json({ success: false, error: 'queueId required' });
            break;
          }
          const submission = await SubmissionQueue.findOne({ queueId });
          if (!submission) {
            res.json({ success: false, error: 'Submission not found' });
            break;
          }
          res.json({
            success: true,
            status: submission.status,
            processedAt: submission.processedAt,
            error: submission.error
          });
          break; // Added missing break
        } catch (err) {
          res.json({ success: false, error: err.message });
          break;
        }

      case 'publishResult':
        result = await examController.publishResult(
          data.testId,
          data.userId,
          data.sessionToken
        );
        res.json(result);
        break;

      case 'publishAllResults':
        result = await examController.publishAllResults(
          data.testId,
          data.sessionToken
        );
        res.json(result);
        break;

      // TODO: Implement all other actions from Code.gs
      default:
        res.json(notImplemented());
        break;
    }
  } catch (err) {
    res.json(error(err.message));
  }
};

module.exports = router;