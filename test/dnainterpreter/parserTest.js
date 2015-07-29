var parser    = require('../../src/dnainterpreter/parser.js'),
    tokenizer = require('../../src/dnainterpreter/tokenizer.js');

var Token = function(valueString, lineNum) {
  return { value : valueString || "", lineNum : lineNum || 5 };
};

module.exports.testParseNumber = {
  validNumber : function(test) {
    var numberCmd = parser.parseNumber(Token("1253")).result;

    test.equals(numberCmd(), 1253, "parsed number function should return the number's value");
    test.done();
  },

  invalidNumber : function(test) {
    var result = parser.parseNumber(Token("aoeu"));

    test.ok(result.error, "Error expected");
    test.equals(result.error.lineNum, 5, "Expected result payload to contain token");
    test.done();
  }
};

module.exports.testParseSysvar = {
  validSysvar : function(test) {
    var sysvarCmd = parser.parseSysvar(Token("*.nrg")).result,
        sysvars   = {};

    test.equals(sysvarCmd(sysvars), 0, "uninitialized sysvars equal 0");

    sysvars.nrg = 1000;

    test.equals(sysvarCmd(sysvars), 1000, "parsed sysvar command should return sysvar value");
    test.done();
  },

  invalidSysvar : function(test) {
    var result = parser.parseSysvar(Token(".nrg"));

    test.ok(result.error, "parsing an invalid sysvar token sohuld result in an error");
    test.done();
  }
};

module.exports.testParseSysvarAddr = {
  validSysvarAddr : function(test) {
    var sysvarCmd = parser.parseSysvarAddr(Token(".nrg")).result;

    test.equals(sysvarCmd(), "nrg", "Expected sysvar name to be returned");
    test.done();
  },

  invalidSysvarAddr : function(test) {
    var result = parser.parseSysvarAddr(Token("aoeu"));

    test.ok(result.error, "Expected an error when parsing invalid sysvar");
    test.done();
  }
};

var binOpTests = function(test, cmdString, testDescriptors) {
  testDescriptors.forEach(function(descriptor) {
    var cmd = parser.parseOperation(Token(cmdString)).result,
        res = cmd(descriptor.a, descriptor.b);

    test.equals(res, descriptor.result,
      "parsed " + cmdString + "(" + descriptor.a + ", " + descriptor.b +
      ") and got " + res + " but expected " + descriptor.result);
  });

  test.done();
};

module.exports.testParseOperation = {
  add : function(test) {
    binOpTests(test, "add", [
      { a : 100       , b : 1         , result : 101 } ,
      { a : undefined , b : 10        , result : 10 } ,
      { a : 10        , b : undefined , result : 10 } ,
      { a : "10"      , b : "aoeu"    , result : 0 }
    ]);
  },

  sub : function(test) {
    binOpTests(test, "sub", [
      { a : 100       , b : 1         , result : 99 } ,
      { a : undefined , b : 10        , result : -10 } ,
      { a : 10        , b : undefined , result : 10 } ,
      { a : "10"      , b : "aoeu"    , result : 0 }
    ]);
  },

  mult : function(test) {
    binOpTests(test, "mult", [
      { a : 100       , b : 1         , result : 100 } ,
      { a : undefined , b : 10        , result : 0 } ,
      { a : 10        , b : undefined , result : 0 } ,
      { a : "10"      , b : "aoeu"    , result : 0 }
    ]);
  },

  div : function(test) {
    binOpTests(test, "div", [
      { a : 100       , b : 1         , result : 100 } ,
      { a : 100       , b : 2         , result : 50 } ,
      { a : 3         , b : 5         , result : 1 } ,
      { a : undefined , b : 10        , result : 0 } ,
      { a : 10        , b : undefined , result : 0 } ,
      { a : "10"      , b : "aoeu"    , result : 0 }
    ]);
  },
};

var expressionStrings = {
  invalid : "1 3 add 56",
  simple  : "1 3 add",
  complex : "1 2 add 2 3 mult sub",
  readSysvar : "*.nrg 5 mult",
  storeSysvar : "10 .up store"
};

var _testExpressions = function(test, testDescriptors) {
  testDescriptors.forEach(function(descriptor) {
    var tokens       = tokenizer.tokenize(descriptor.source),
        result       = parser.parseExpression(tokens),
        cmd          = result.result;

    test.equals(cmd(), descriptor.result,
      "expected result to be " + descriptor.result + " but got " + cmd());
  });
  test.done();
};

module.exports.testParseExpression = {
  invalidExpression : function(test) {
    var tokens = tokenizer.tokenize(expressionStrings.invalid),
        result = parser.parseExpression(tokens);

    test.ok(result.error, "Expected an error when parsing a malformed expression");
    test.done();
  },

  validExpressions : function(test) {
    _testExpressions(test, [
      { source : expressionStrings.simple, result : 4 },
      { source : expressionStrings.complex, result : -3 }
    ]);
  },

  readSysvarExpression : function(test)  {
    var tokens = tokenizer.tokenize(expressionStrings.readSysvar),
        cmd    = parser.parseExpression(tokens).result;

    test.equals(cmd({ nrg : 10}), 50, "Expected expression to equal nrg * 5");
    test.done();
  },

  storeSysvar : function(test) {
    var tokens  = tokenizer.tokenize(expressionStrings.storeSysvar),
        cmd     = parser.parseExpression(tokens).result,
        sysvars = {};

    test.equals(cmd(sysvars), 10, "sysvar value should be returned from store expression");
    test.equals(sysvars.up, 10, "value should be saved to the sysvar");
    test.done();
  }
};

var bodySources = {
  noStop : "start 1 3 add .up store",
  noStart : "1 3 add .up store stop",
  oneExpression : "start 1 .up store stop"
};

var bodyTests = function(test, testDescriptors) {
  testDescriptors.forEach(function(descriptor) {
    var tokens  = tokenizer.tokenize(descriptor.source),
        result  = parser.parseBody(tokens),
        sysvars = {};

    test.ok(!result.error,
      "Failed to parse body with source: " + descriptor.source + "\n" +
      "Error was: " + result.error);

    result.result(sysvars);
    Object.getOwnPropertyNames(descriptor.expectedSysvars)
      .forEach(function(sysvarName) {
        test.equals(descriptor.expectedSysvars[sysvarName], sysvars[sysvarName],
          "Unexpected value found in ." + sysvarName + " expected " +
          descriptor.expectedSysvars[sysvarName] + " but got " + sysvars[sysvarName] +
          "\n " + descriptor.source);
      });
  });
  test.done();
};

module.exports.testParseBody = {
  noStop : function(test) {
    var tokens = tokenizer.tokenize(bodySources.noStop),
        result = parser.parseBody(tokens);

    test.ok(result.error, "expected an error when parsing the body");
    test.equals(result.error.payload.value, "store", "Expected the error to contain the offending token");
    test.done();
  },

  noStart : function(test) {
    var tokens = tokenizer.tokenize(bodySources.noStart),
        result = parser.parseBody(tokens);

    test.ok(result.error, "Expected error when parsing body");
    test.equals(result.error.payload.value, "", "Expected error to contain offending token");
    test.equals(result.error.payload.lineNum, 1, "Expected error to contain proper line number");
    test.done();
  },

  validBodies : function(test) {
    bodyTests(test, [
      { source : "start 1 .up store 3 .shoot store stop",
        expectedSysvars : { up : 1, shoot : 3}
      },
      { source : "start 10 .up store 3 *.up mult .down store stop",
        expectedSysvars : { up : 10, down : 30 }
      },
      { source : "start 5 .up add .down store 1 6 mult .dx store stop",
        expectedSysvars : { down : 5, dx : 6 }
      }
    ]);
  }
};








