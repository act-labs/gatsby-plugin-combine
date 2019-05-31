
const {createCompoundPages} = require("./combine");

exports.createPages = async function(gatsby, options){ 
    await createCompoundPages({gatsby, options});
}


  