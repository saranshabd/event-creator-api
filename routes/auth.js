'use strict'

const { Router } = require('express')
const { Pool } = require('pg')

// import string utility functions
const {
  containsEmptyString,
  validateEmail,
  hashStr,
  verifyHashStr
} = require('../utils/string')

// import token utility functions
const { encodeToken, verifyTokenMiddleware } = require('../utils/token')

// import email utility functions
const { getEmailTemplate, getEmailTransport } = require('../utils/email')

// import token types
const { USER_ACCESS_TOKEN } = require('../constants/tokenTypes')

// import email types
const { USER_REGISTRATION } = require('../constants/emailTypes')

const router = Router()
const pool = new Pool()

router.post('/register', (request, response) => {
  let { name, email, password } = request.body

  // check for invalid arguments
  if (containsEmptyString([name, email, password]) || !validateEmail(email))
    return response
      .status(400)
      .json({ status: false, message: 'invalid arguments' })

  // convert all characters of email to lowercase
  email = email.toString().toLowerCase()

  // check if user is already registered with given email address
  pool
    .query(`SELECT COUNT(*) FROM users WHERE email='${email}'`)
    .then(data => {
      if (data.rows[0].count != 0)
        return response.status(400).json({
          status: false,
          message: 'user already registered'
        })

      // encrypt password
      password = hashStr(password)

      // sign user access token
      const userAccessToken = encodeToken(
        { name, email, password },
        USER_ACCESS_TOKEN
      )

      // generate user registration URL
      const registrationUrl =
        process.env.APPLICATION_URL +
        '/registration?UserAccessToken=' +
        userAccessToken

      // get email template & fill it with real values
      let template = getEmailTemplate(USER_REGISTRATION).toString()
      template = template.replace('@@name@@', name)
      template = template.replace('@@registrationUrl@@', registrationUrl)

      // send email to the user
      getEmailTransport()
        .sendMail({
          from: 'Mext',
          to: email,
          subject: 'Email Verification - Mext',
          html: template
        })
        .then(() => {
          console.log(userAccessToken)
          response.status(200).json({
            status: true,
            message: 'user verification email sent to the user'
          })
        })
        .catch(error => {
          console.log(error)
          response
            .status(500)
            .json({ status: false, message: 'internal server error' })
        })
    })
    .catch(error => {
      console.log(error)
      return response
        .status(500)
        .json({ status: false, message: 'internal server error' })
    })
})

router.post(
  '/register/confirm',
  verifyTokenMiddleware(USER_ACCESS_TOKEN),
  (request, response) => {
    const { name, email, password } = request.decryptToken.decoded
    const userAccessToken = request.body.token

    pool
      .query(
        `INSERT INTO users (name, email, password, user_access_token) VALUES ('${name}', '${email}', '${password}', '${userAccessToken}')`
      )
      .then(() => {
        response
          .status(200)
          .json({ status: true, message: 'user registered successfully' })
      })
      .catch(error => {
        if (error.code === '23505')
          return response
            .status(200)
            .json({ status: true, message: 'user is already registered' })

        console.log(error)
        response
          .status(500)
          .json({ status: false, message: 'internal server error' })
      })
  }
)

router.post('/login', (request, response) => {
  let { email, password } = request.body

  // check for invalid arguments
  if (containsEmptyString([email, password]) || !validateEmail(email))
    return response
      .status(400)
      .json({ status: false, message: 'invalid arguments' })

  // convert all characters of email to lowercase
  email = email.toString().toLowerCase()

  // login user
  pool
    .query(
      `SELECT password, user_access_token FROM users WHERE email='${email}'`
    )
    .then(data => {
      // check if user is registered
      if (data.rowCount === 0)
        return response
          .status(400)
          .json({ status: false, message: 'user is not registered' })

      // check user password
      if (!verifyHashStr(data.rows[0].password, password))
        return response.status(400).json({
          status: false,
          message: 'incorrect password'
        })

      // return user access token
      response.status(200).json({
        status: true,
        message: 'user logged in successfully',
        data: {
          token: data.rows[0].user_access_token
        }
      })
    })
    .catch(error => {
      console.log(error)
      response
        .status(500)
        .json({ status: false, message: 'internal server error' })
    })
})

module.exports = router
