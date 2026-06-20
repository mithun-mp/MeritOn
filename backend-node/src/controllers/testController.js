async function importCsvQuestions(data, sessionToken) {
  try {
    console.log("[CSV TRACE] Entering importCsvQuestions");
    const isAdmin = await verifyAdminSession(sessionToken);
    if (!isAdmin) {
      return { success: false, error: 'Unauthorized' };
    }

    const storageMode = testPaperUtils.getStorageMode();
    const importMode = data.mode || data.importMode || 'create_new';
    const rawQuestionMode = data.questionMode || data.csvQuestionMode || data.updateMode;
    const questionMode = rawQuestionMode || (importMode === 'update_existing' ? 'replace_all_questions' : 'replace_all_questions');
    console.log("[CSV TRACE] After questionMode declaration:", questionMode);

    // Validate questionMode
    const validQuestionModes = ['replace_all_questions', 'append_questions', 'upsert_by_qid'];
    if (!validQuestionModes.includes(questionMode)) {
      return { success: false, error: `Invalid questionMode: ${questionMode}` };
    }

    const testId = data.testId || data.TestID || data.TestId;
    const testData = data.testData || {};
    const questions = data.questions || [];

    console.log('[CSV IMPORT BACKEND]', {
      mode: importMode,
      questionMode,
      testId,
      questionCount: questions.length
    });

    console.log("[CSV DEBUG] About to start normalization");
    // Validate questions
    const normalizedQuestions = [];
    questions.forEach((q, index) => {
      console.log(`[CSV DEBUG] Processing question ${index}`, q);
      const normalized = normalizeCsvQuestion(q);
      console.log(`[CSV DEBUG] Normalized question ${index}`, normalized);
      // Log first 3 rows for debugging
      if (index < 3) {
        console.log("[CSV RAW ROW]", q);
        console.log("[CSV NORMALIZED QUESTION]", normalized);
      }
      // Validate
      if (!normalized.question.trim()) throw new Error('Question text is required');
      if (!normalized.options.A.trim() || !normalized.options.B.trim() || !normalized.options.C.trim() || !normalized.options.D.trim()) throw new Error('All options (A-D) are required');
      if (!['A', 'B', 'C', 'D'].includes(normalized.correct)) throw new Error('Correct answer must be A, B, C, or D');
      normalizedQuestions.push(normalized);
    });
    console.log("[CSV DEBUG] Finished normalization");

    let finalTestId;
    let finalQuestions;
    let sectionNames = [];

    if (importMode === 'create_new') {
      finalTestId = 'T' + uuidv4().slice(0, 8);
      sectionNames = testData.Sections?.map(s => s.name || s) || [...new Set(normalizedQuestions.map(q => q.section))];
      finalQuestions = normalizedQuestions;
    } else {
      if (!testId) throw new Error('Test ID is required for update mode');

      const existingTestPaper = await TestPaper.findOne({ TestID: testId });
      if (!existingTestPaper) {
        const converted = await testPaperUtils.convertLegacyToTestPaper(testId);
        if (!converted) throw new Error('Test not found');
        throw new Error('Test found but not in TestPaper collection, please convert first');
      }

      finalTestId = testId;

      // Update test data if provided (handle both capitalized and lowercase keys)
      if (testData) {
        if (testData.Name || testData.name) existingTestPaper.meta.name = testData.Name || testData.name;
        if (testData.Date || testData.date) existingTestPaper.meta.date = testData.Date || testData.date;
        if (testData.StartTime || testData.startTime) existingTestPaper.meta.startTime = testData.StartTime || testData.startTime;
        if (testData.ExpiryTime || testData.expiryTime) existingTestPaper.meta.expiryTime = testData.ExpiryTime || testData.expiryTime;
        if (testData.Duration || testData.duration) existingTestPaper.meta.duration = testData.Duration || testData.duration;
        if (testData.Mode || testData.mode) existingTestPaper.meta.mode = testData.Mode || testData.mode;
        if (testData.ExamType || testData.examType) existingTestPaper.meta.examType = testData.ExamType || testData.examType;
        if (testData.QuickResult !== undefined || testData.quickResult !== undefined) {
          existingTestPaper.meta.quickResult = testData.QuickResult !== undefined ? testData.QuickResult : testData.quickResult;
        }
        if (testData.liveLeaderboardEnabled !== undefined) existingTestPaper.meta.liveLeaderboardEnabled = testData.liveLeaderboardEnabled;
        if (testData.Sections || testData.sections) {
          sectionNames = (testData.Sections || testData.sections).map(s => s.name || s);
        }
      }

      if (!sectionNames.length) {
        sectionNames = existingTestPaper.sections.map(s => s.name);
      }

      // Handle question update modes
      const existingNonDeleted = existingTestPaper.questions.filter(q => !q.isDeleted);
      const existingQids = new Set(existingNonDeleted.map(q => q.qid));

      if (questionMode === 'replace_all_questions') {
        finalQuestions = normalizedQuestions;
      } else if (questionMode === 'append_questions') {
        // Check for duplicate QIDs
        const duplicateQids = normalizedQuestions.filter(q => existingQids.has(q.qid)).map(q => q.qid);
        if (duplicateQids.length > 0) {
          throw new Error(`Duplicate QID found: ${duplicateQids.join(', ')}. Use upsert mode to update existing QIDs.`);
        }
        finalQuestions = [...existingNonDeleted, ...normalizedQuestions];
      } else if (questionMode === 'upsert_by_qid') {
        // Upsert mode
        const existingMap = new Map(existingNonDeleted.map(q => [q.qid, q]));
        normalizedQuestions.forEach(q => {
          existingMap.set(q.qid, q);
        });
        finalQuestions = Array.from(existingMap.values());
      } else {
        throw new Error('Invalid question mode');
      }
    }

    const { stats, sections } = testPaperUtils.calculateStatsAndSections(finalQuestions, sectionNames);

    if (importMode === 'create_new') {
      // Create new TestPaper
      await TestPaper.create({
        TestID: finalTestId,
        meta: {
          name: testData.Name || testData.name,
          date: testData.Date || testData.date,
          startTime: testData.StartTime || testData.startTime,
          expiryTime: testData.ExpiryTime || testData.expiryTime,
          duration: testData.Duration || testData.duration,
          mode: testData.Mode || testData.mode || 'online',
          examType: testData.ExamType || testData.examType || 'standard',
          quickResult: testData.QuickResult !== undefined ? testData.QuickResult : (testData.quickResult || false),
          liveLeaderboardEnabled: testData.liveLeaderboardEnabled !== false,
          answerKeyPublished: false,
          answerKeyPublishedAt: null,
          isDeleted: false,
          deletedAt: null
        },
        sections,
        questions: finalQuestions,
        stats
      });

      // Dual write to legacy if needed
      if (storageMode === testPaperUtils.STORAGE_MODES.DUAL || storageMode === testPaperUtils.STORAGE_MODES.LEGACY) {
        await Test.create({
          TestID: finalTestId,
          Name: testData.Name || testData.name,
          Date: testData.Date || testData.date,
          StartTime: testData.StartTime || testData.startTime,
          EndTime: testData.ExpiryTime || testData.expiryTime,
          Duration: testData.Duration || testData.duration,
          Sections: JSON.stringify(sections),
          Mode: testData.Mode || testData.mode || 'online',
          ExpiryTime: testData.ExpiryTime || testData.expiryTime,
          ExamType: testData.ExamType || testData.examType || 'standard',
          QuickResult: testData.QuickResult !== undefined ? testData.QuickResult : (testData.quickResult || false),
          LiveLeaderboardEnabled: testData.liveLeaderboardEnabled !== false,
          IsDeleted: false
        });

        const legacyQuestions = finalQuestions.map(q => ({
          TestID: finalTestId,
          Section: q.section,
          QID: q.qid,
          Difficulty: q.difficulty,
          Question: q.question,
          A: q.options.A,
          B: q.options.B,
          C: q.options.C,
          D: q.options.D,
          Correct: q.correct,
          Marks: q.marks,
          NegativeMarks: q.negativeMarks,
          IsDeleted: false
        }));

        await Question.insertMany(legacyQuestions);
      }
    } else {
      // Update existing TestPaper
      const testPaper = await TestPaper.findOne({ TestID: finalTestId });
      testPaper.sections = sections;
      testPaper.questions = finalQuestions;
      testPaper.stats = stats;
      await testPaper.save();

      // Dual write to legacy if needed
      if (storageMode === testPaperUtils.STORAGE_MODES.DUAL || storageMode === testPaperUtils.STORAGE_MODES.LEGACY) {
        // Update legacy test
        const legacyTest = await Test.findOne({ TestID: finalTestId });
        if (legacyTest) {
          if (testData?.name) legacyTest.Name = testData.name;
          if (testData?.date) legacyTest.Date = testData.date;
          if (testData?.startTime) legacyTest.StartTime = testData.startTime;
          if (testData?.expiryTime) legacyTest.ExpiryTime = testData.expiryTime;
          if (testData?.endTime) legacyTest.EndTime = testData.endTime;
          if (testData?.duration) legacyTest.Duration = testData.duration;
          if (testData?.sections) legacyTest.Sections = JSON.stringify(sections);
          if (testData?.mode) legacyTest.Mode = testData.mode;
          if (testData?.examType) legacyTest.ExamType = testData.examType;
          if (typeof testData.QuickResult === 'boolean') legacyTest.QuickResult = testData.QuickResult;
          if (typeof testData.liveLeaderboardEnabled === 'boolean') legacyTest.LiveLeaderboardEnabled = testData.liveLeaderboardEnabled;
          if (typeof testData.AnswerKeyPublished === 'boolean') legacyTest.AnswerKeyPublished = testData.AnswerKeyPublished;
          await legacyTest.save();
        }

        // Update legacy questions
        await Question.deleteMany({ TestID: finalTestId });
        const legacyQuestions = finalQuestions.map(q => ({
          TestID: finalTestId,
          Section: q.section,
          QID: q.qid,
          Difficulty: q.difficulty,
          Question: q.question,
          A: q.options.A,
          B: q.options.B,
          C: q.options.C,
          D: q.options.D,
          Correct: q.correct,
          Marks: q.marks,
          NegativeMarks: q.negativeMarks,
          IsDeleted: false
        }));
        await Question.insertMany(legacyQuestions);
      }
    }

    await AuditLog.create({
      Timestamp: new Date(),
      Action: 'importCsvQuestions',
      UserID: 'admin',
      TestID: finalTestId,
      Details: `CSV import ${importMode} with ${normalizedQuestions.length} questions`
    });

    return {
      success: true,
      testId: finalTestId,
      mode: importMode,
      questionMode,
      questionCount: finalQuestions.length,
      stats
    };
  } catch (err) {
    await ErrorLog.create({
      Timestamp: new Date(),
      Function: 'importCsvQuestions',
      Error: err.message
    });
    return { success: false, error: err.message };
  }
}