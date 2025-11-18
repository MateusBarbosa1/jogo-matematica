module.exports = function(app) {
    const homeControllers = require('../controllers/homeControllers');

    app.get('/', (req,res) => {
        homeControllers.renderPage(app,req,res);
    });
}