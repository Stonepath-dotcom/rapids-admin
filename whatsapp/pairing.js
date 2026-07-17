const {
    connectToWhatsApp
}=require("./connect");


async function pairing(phoneNumber, callback){

    await connectToWhatsApp(
        phoneNumber,
        callback
    );

}


module.exports={
    pairing
};
