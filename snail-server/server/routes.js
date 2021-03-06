const passport = require('passport')
const bodies = require('body-parser')
const mongoose = require('mongoose')
const router = require('express').Router()
const PlayerRemotes = Object.create(null) // TODO Cleanup on Join | Disconnected

// const { ensureLoggedIn } = require('connect-ensure-login')

router.use(bodies.urlencoded({ extended: true }))
router.use(bodies.json())

// router.use(function(req, res, next) {
// 	res.header('Access-Control-Allow-Origin', 'http://127.0.0.1:3001')
// 	res.header('Access-Control-Allow-Headers', 'X-Requested-With')
// 	next()
// })

/* function GetPlayerLicense (source) {
	let i = 0, ident
	const len = global.GetNumPlayerIdentifiers(source)

	for (; i < len; i++)
	{
		ident = global.GetPlayerIdentifier(source, i)
		if (ident && ident.startsWith('license'))
			return ident
	}
} */

function RegistrationReply (src, err, res) {
	setImmediate(function () {
		global.emitNet('express:Register', src, err, res || false)
	})
}

if (global.RegisterNetEvent) {
	// Sign up
	// TODO Signup with valid email for recovery
	global.RegisterNetEvent('express:Register')
	global.onNet('express:Register', function (username, password)
	{
		const src = global.source
		const license = GetPlayerIdentifier(src, 0)

		if (license) {
			const User = mongoose.model('User')
			const user = new User({ license, username, password })
			user.save(function (err /*, user*/) {
				if (err) {
					if (err.errors)
						RegistrationReply(src, 1) // Error: Failed to validate user
					else if (err.message.startsWith('E11000 duplicate')) {
						if (err.message.indexOf('license') != -1)
							RegistrationReply(src, 4) // Error: Already registered
						else
							RegistrationReply(src, 2) // Error: Duplicate user
					}
					else
						RegistrationReply(src, 3) // Error: Failed to save user
				} else
					RegistrationReply(src, false, true) // Success: User registered
			})

			if (process._tickCallback) process._tickCallback()
		} else RegistrationReply(src, 3)
	})
}

router.all('/logout', (req, res) => {
	const xhr = !!(req.body && req.body.xhr)

	req.logout()

	if (!xhr) res.redirect('/')
	else res.json({ authenticated: false })
})

// TODO Clean this up
router.post('/login', function (req, res, next) {
	const xhr = !!(req.body && req.body.xhr)

	// request is authenticated already
	if (xhr && req.isAuthenticated()) {
		res.json({ user: req.user.toJSON(), authenticated: true })
		return
	}

	passport.authenticate('local', function(err, user /*, info */) {
		const message = 'Invalid potatoes or password.'

		if (err) {
			if (xhr) return res.json({
				message: err.message,
				authenticated: false
			})
			else return next(err)
		}

		if (!user) {
			if (!xhr) {
				req.flash('message', message)

				return res.redirect('/login')
			}

			return res.json({
				message,
				authenticated: false
			})
		}

		req.logIn(user, function(err) {
			req.flash('message') // clear

			if (err) {
				if (xhr) return res.json({
					message: err.message,
					authenticated: false
				})
				else return next(err)
			}

			if (xhr) return res.json({
				user: req.user.toJSON(),
				authenticated: true
			})

			return res.redirect('/')
		})
	})(req, res, next)
})

////////////////////////////////////////////////////////////////////////////////
// PAIR WRTC CLIENTS

if (global.RegisterNetEvent) { // Set initiator URI
	global.RegisterNetEvent('express:Remote')
	global.onNet('express:Remote', function (remote) {
		const src = global.source
		const license = GetPlayerIdentifier(src, 0)
		if (license)
			PlayerRemotes[license] =  { source: src, remote }
	})
}

router.get('/pair', function (req, res) { // Get initiator URI
	if (!req.isAuthenticated())
		return res.json({ message: 'unauthorized' })

	const player = PlayerRemotes[req.user.license]

	if (!player || !global.GetNumPlayerIdentifiers(player.source))
		return res.json({ message: 'offline' }) // fivem client is offline

	res.json({ uri: player.remote })
})


router.post('/pair', function (req, res) {
	if (!req.isAuthenticated())
		return res.json({ message: 'unauthorized' })

	const player = PlayerRemotes[req.user.license]

	if (!player || !global.GetNumPlayerIdentifiers(player.source))
		return res.json({ message: 'offline' })

	res.json({ uri: player.remote })

	delete PlayerRemotes[req.user.license]

	setTimeout(function () {
		if (global.TriggerClientEvent)
			global.TriggerClientEvent('snaildash:Remote', player.source, req.body.uri)
	}, 500)
})

module.exports = router
