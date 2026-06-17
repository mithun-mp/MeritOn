
const express = require('express');
const router = express.Router();
const { success, error, notImplemented } = require('../utils/responseFormatter');
const authController = require('../controllers/authController');
const userAuthController = require('../controllers/userAuthController');
const testController = require('../controllers/testController');
const questionController = require('../controllers/questionController');
const examController = require('../controllers/examController');
const testDraftController = require('../controllers/testDraftController');

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
  const action = req.body.action;
  await handleAction(action, req, res, 'post');
});

// Handle all actions
const handleAction = async (action, req, res, method) => {
  if (!action) {
    res.json(error('Action is required'));
    return;
  }

  let result;
  try {
    switch (action) {
      // Health check
      case 'health':
        res.json(success({ status: 'ok' }));
        break;

      // Admin auth actions
      case 'verifyAdmin':
        result = await authController.verifyAdmin(req.query.sessionToken || req.body.sessionToken);
        res.json(result);
        break;

      case 'adminLogin':
        result = await authController.adminLogin(req.body.username, req.body.password);
        res.json(result);
        break;

      case 'logoutSession':
        result = await authController.logoutSession(req.body.sessionToken);
        res.json(result);
        break;

      // User auth actions
      case 'sendOTP':
        result = await userAuthController.sendOTP(req.body.email, req.body.type);
        res.json(result);
        break;

      case 'registerUser':
        result = await userAuthController.registerUser(req.body);
        res.json(result);
        break;

      case 'loginUser':
        result = await userAuthController.loginUser(req.body.email, req.body.password, req.body.ip);
        res.json(result);
        break;

      case 'forgotPassword':
        result = await userAuthController.forgotPassword(req.body.identifier);
        res.json(result);
        break;

      case 'resetPassword':
        result = await userAuthController.resetPassword(req.body.identifier, req.body.otp, req.body.newPassword);
        res.json(result);
        break;

      // Test management actions
      case 'getAllTests':
        result = await testController.getAllTests(req.query);
        res.json(result);
        break;

      case 'createTest':
        result = await testController.createTest(req.body, req.body.sessionToken);
        res.json(result);
        break;

      case 'updateTest':
        result = await testController.updateTest(req.body.testId, req.body, req.body.sessionToken);
        res.json(result);
        break;

      case 'deleteTest':
        result = await testController.deleteTest(req.body.testId, req.body.sessionToken, req.body.permanent);
        res.json(result);
        break;

      // Question management actions (GET)
      case 'getQuestions':
        result = await questionController.getQuestions(
          req.query.testId,
          req.query.includeAnswers === 'true',
          req.query.sessionToken || req.body.sessionToken
        );
        res.json(result);
        break;

      case 'getAnswers':
        result = await questionController.getAnswers(
          req.query.testId
        );
        res.json(result);
        break;

      case 'getAllUsers':
        result = await userAuthController.getAllUsers(
          req.query.sessionToken || req.body.sessionToken
        );
        res.json(result);
        break;

      case 'getMalpracticeLogs':
        result = await examController.getMalpracticeLogs(
          req.query,
          req.query.sessionToken || req.body.sessionToken
        );
        res.json(result);
        break;

      // Question management actions (POST)
      case 'addQuestions':
        result = await questionController.addQuestions(
          req.body.testId,
          req.body.questions,
          req.body.sessionToken
        );
        res.json(result);
        break;

      case 'updateQuestion':
        result = await questionController.updateQuestion(
          req.body.testId,
          req.body.qid,
          req.body,
          req.body.sessionToken
        );
        res.json(result);
        break;

      case 'deleteQuestion':
        result = await questionController.deleteQuestion(
          req.body.testId,
          req.body.qid,
          req.body.sessionToken,
          req.body.permanent
        );
        res.json(result);
        break;

      // Exam / Analytics actions (GET)
      case 'getResults':
        result = await examController.getResults(req.query, req.query.sessionToken);
        res.json(result);
        break;
      case 'getPerformance':
        result = await examController.getPerformance(req.query, req.query.sessionToken);
        res.json(result);
        break;
      case 'getResponses':
        result = await examController.getResponses(req.query);
        res.json(result);
        break;
      case 'getCandidateAnalytics':
        result = await examController.getCandidateAnalytics(req.query.userID || req.query.userId);
        res.json(result);
        break;

      // Exam / Analytics actions (POST)
      case 'submitTest':
        result = await examController.submitTest(req.body);
        res.json(result);
        break;
      case 'publishResult':
        result = await examController.publishResult(
          req.body.testId,
          req.body.userId,
          req.body.sessionToken
        );
        res.json(result);
        break;
      case 'publishAllResults':
        result = await examController.publishAllResults(
          req.body.testId,
          req.body.sessionToken
        );
        res.json(result);
        break;
      case 'publishAnswerKey':
        result = await testController.publishAnswerKey(
          req.body.testId,
          req.body.sessionToken
        );
        res.json(result);
        break;

      // Test Draft actions
      case 'saveTestDraft':
        result = await testDraftController.saveTestDraft(
          req.body,
          req.body.sessionToken
        );
        res.json(result);
        break;
      case 'getTestDraft':
        result = await testDraftController.getTestDraft(
          req.query.DraftID || req.body.DraftID,
          req.query.sessionToken || req.body.sessionToken
        );
        res.json(result);
        break;
      case 'deleteTestDraft':
        result = await testDraftController.deleteTestDraft(
          req.body.DraftID,
          req.body.sessionToken
        );
        res.json(result);
        break;
      case 'commitDraftToTest':
        result = await testDraftController.commitDraftToTest(
          req.body.DraftID,
          req.body.sessionToken
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
