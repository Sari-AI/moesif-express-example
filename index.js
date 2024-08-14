var express = require('express');
var bodyParser = require('body-parser');
var app = express();
var superagent = require('superagent');
var _ = require('lodash');
var Joi = require('joi');
require('dotenv').config();

var httpProxy = require('http-proxy');

var moesif = require('moesif-nodejs');

const { expressjwt } = require("express-jwt");


var port = process.env.PORT || 5050

// Set the options, the only required field is applicationId.
var moesifOptions = {

  applicationId: process.env.MOESIF_APPLICATION_ID || 'Your Moesif Application Id',

  baseUri: 'https://api.moesif.net',

  debug: true,

  identifyUser: function (req, res) {
    if (req.auth) {
      return req.auth.id;
    }
    if (req.user) {
      return req.user.id;
    }
    if (req.headers['x-user-id']) {
      return req.headers['x-user-id'];
    }
    if (req.headers['my-user-id']) {
      return req.headers['my-user-id'];
    }
    return undefined;
  },

  identifyCompany: function (req, res) {
    if (req.headers['x-company-id']) {
      return req.headers['x-company-id']
    }
    if (req.headers['my-company-id']) {
      return req.headers['my-company-id'];
    }
    return undefined;
  },

  getSessionToken: function (req, res) {
    return req.headers['Authorization'];
  },

  getMetadata: function (req, res) {
    return {
      foo: 'express',
      bar: 'example',
      my_date_field: (new Date()).toISOString()
    }
  },

  // batchMaxTime: 10000,
  // batchSize: 15,
  disableBatching: true,

  // modify the option below to test out limits for responseMaxBodySize
  responseMaxBodySize: 5000,

  maxOutgoingTimeout: 10,

  callback: function (error, data) {
    console.log('inside call back');
    console.log('error: ' + JSON.stringify(error));
  }
};

moesifOptions.maskContent = function (event) {
  console.log('event before masking' + JSON.stringify(event));
  const newEvent = _.omit(event, ['request.headers.authorization']);
  console.log('event after masking' + JSON.stringify(newEvent));
  return newEvent;
}

var moesifMiddleware = moesif(moesifOptions);

const userSchema = Joi.object({
  userId: Joi.string().required(),
  companyId: Joi.string(),
  metadata: Joi.object({
    email: Joi.string().email().required(),
    firstName: Joi.string().required(),
    lastName: Joi.string().required(),
    title: Joi.string(),
    salesInfo: Joi.object({
      stage: Joi.string(),
      lifetimeValue: Joi.number(),
      accountOwner: Joi.string().email()
    })
  }).required()
});

// Middleware for user validation
const validateUser = (req, res, next) => {
  console.log("validateUser")
  const { error } = userSchema.validate(req.body);
  console.log("error", error)
  if (error) {
    return res.status(400).json({ error: error.details[0].message });
  }
  next();
};

const companySchema = Joi.object({
  companyId: Joi.string().required(),
  companyDomain: Joi.string(),
  metadata: Joi.object({
    orgName: Joi.string().required(),
    planName: Joi.string().required(),
    dealStage: Joi.string(),
    mrr: Joi.number(),
    demographics: Joi.object({
      alexaRanking: Joi.number(),
      employeeCount: Joi.number(),
    })
  }).required()
});

// Middleware for user validation
const validateCompany = (req, res, next) => {
  console.log("validateCompany")
  const { error } = companySchema.validate(req.body);
  console.log("error", error)
  if (error) {
    return res.status(400).json({ error: error.details[0].message });
  }
  next();
};

app.use(moesifMiddleware);
// moesifMiddleware.startCaptureOutgoing();

app.get('/', function (req, res) {
  console.log(req.body);
  res.send('hello world!');
});

app.post('/multipart', function (req, res) {
  console.log('inside multi part');
  console.log(req.body);
  res.send('received');
});

app.get('/large-string-response', function (req, res) {
  var really_long_string = (new Array(10001)).join("x");
  res.send(really_long_string);
});

// router are prefaced by /api
// and uses bodyParser
var router = express.Router();

router.use(bodyParser.urlencoded({ extended: true }));
router.use(express.json({ limit: '50mb', extended: true }));
router.use(bodyParser.text({ type: 'text/plain' }))

router.get('/', function (req, res) {
  console.log('req body in customer api');
  console.log(req.body);
  res.json({ message: 'first json api' });
});

router.post('/large', function (req, res) {
  console.log('req body in customer api');
  console.log(req.body);
  res.json({ message: 'post successful' })
});

// ADD COMPANY
router.post('/update-company', validateCompany, function (req, res) {
  console.log('req body in customer api');
  console.log(req.body);

  var company = req.body;

  // Only companyId is required.
  // Campaign object is optional, but useful if you want to track ROI of acquisition channels
  // See https://www.moesif.com/docs/api#update-a-company for campaign schema
  // metadata can be any custom object
  // const company = {
  //   companyId: '67890',
  //   companyDomain: 'acmeinc.com', // If domain is set, Moesif will enrich your profiles with publicly available info
  //   metadata: {
  //     orgName: 'Acme, Inc',
  //     planName: 'Free Plan',
  //     dealStage: 'Lead',
  //     mrr: 24000,
  //     demographics: {
  //       alexaRanking: 500000,
  //       employeeCount: 47,
  //     },
  //   },
  // };

  const callback = () => { }

  moesifMiddleware.updateCompany(company, callback);

  res.json({ message: 'post successful' })
});

// ADD USER
router.post('/update-user', validateUser, function (req, res) {
  console.log('req body in user api');
  console.log(req.body);

  var user = req.body;

  // Only userId is required.
  // Campaign object is optional, but useful if you want to track ROI of acquisition channels
  // See https://www.moesif.com/docs/api#users for campaign schema
  // metadata can be any custom object
  // var user = {
  //   userId: '12345',
  //   companyId: '67890', // If set, associate user with a company object
  //   metadata: {
  //     email: 'john@acmeinc.com',
  //     firstName: 'John',
  //     lastName: 'Doe',
  //     title: 'Software Engineer',
  //     salesInfo: {
  //       stage: 'Customer',
  //       lifetimeValue: 24000,
  //       accountOwner: 'mary@contoso.com'
  //     }
  //   }
  // };

  const callback = () => { }

  moesifMiddleware.updateUser(user, callback);

  res.json({ message: 'post successful' })
});

router.post('/identify-user', expressjwt({ secret: 'shhhhhhared-secret', algorithms: ['HS256'] }), function (req, res) {
  console.log('req body in user api');
  console.log('req.body', req.body);
  console.log('req.auth', req.auth);

  // ONLY WORKS ON CLIENT SIDE
  // moesif.identifyUser("12345");

  res.json({ message: 'post successful' })
});

router.post('/add-credits-to-company', expressjwt({ secret: 'shhhhhhared-secret', algorithms: ['HS256'] }), function (req, res) {
  console.log('req body in user api');
  console.log('req.body', req.body);
  console.log('req.auth', req.auth);

  // ONLY WORKS ON CLIENT SIDE
  // moesif.identifyUser("12345");

  res.json({ message: 'post successful' })
});

router.get('/large-object-response', function (req, res) {
  var reallyBigArray = (new Array(10001)).fill('hi');
  res.json(reallyBigArray);
});

router.get('/outgoing/posts', function (req, res) {
  console.log('outgoing is called');
  superagent.get('https://jsonplaceholder.typicode.com/todos/2').then(function (response) {
    console.log('back from outoging');
    console.log(response.body);
    res.json({ fromTypicode: response.body });
  }).catch(function (err) {
    res.status(500).json(err);
  });
});

/**
 * Example using http-proxy.
 */

var proxyRoute = express.Router();
const proxy = httpProxy.createProxyServer();

proxy.on('error', (error, req, res) => {
  if (error.code !== 'ECONNRESET') {
    console.error('proxy error', error);
  }
  if (!res.headersSent) {
    res.writeHead(500, { 'content-type': 'application/json' });
  }

  const json = { error: 'proxy_error', reason: error.message };
  res.end(JSON.stringify(json));
});


proxyRoute.use('/', (req, res) => {
  proxy.web(req, res, {
    target: 'http://jsonplaceholder.typicode.com',
    ws: false,
    changeOrigin: true,
  });
});

var governanceRoutes = express.Router();

governanceRoutes.get('/no_italy', (req, res) => {
  res.status(200).send({
    success: true
  });
});

governanceRoutes.get('/company1', (req, res) => {
  res.status(200).send({
    success: true
  });
});


governanceRoutes.get('/canada', (req, res) => {
  res.status(200).send({
    success: true
  });
});

governanceRoutes.get('/cairo', (req, res) => {
  res.status(200).send({
    success: true
  });
});

governanceRoutes.get('/for_companies_in_japan_only', (req, res) => {
  res.status(200).send({
    success: true
  });
});

governanceRoutes.get('/random', (req, res) => {
  res.status(200).send({
    success: true
  });
});


app.use('/api', router);

app.use('/proxy', proxyRoute);

app.use('/gov', governanceRoutes);

app.listen(port, function () {
  console.log('Example app is listening on port ' + port);
});

