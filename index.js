const express = require('express');
const app = express();
const cors = require('cors');
const server = require('http').createServer(app);
const io = require('socket.io')(server);
const fs = require('fs');
const jsonfile = require('jsonfile');
const mongoose=require('mongoose');
var admin = require("firebase-admin");
var serviceAccount = require("./firebase.json");

const notification_options = {
    priority: "high",
    timeToLive: 60 * 60 * 24
};

var message = {
	notification: {
		title: 'NotifcatioTestAPP',
		body: '{"Message from node js app"}',
	}
};

var userList={};  
let port = process.env.PORT || 8081;

const corsOptions ={
    origin:'http://192.168.1.2:8100', 
    credentials:true,            //access-control-allow-credentials:true
    optionSuccessStatus:200
}

app.use(express.static(__dirname + '/'));
app.use(cors(corsOptions))

const url = "mongodb+srv://akash:Z7d8AU0DYZvX3Wuf@cluster0.1exu6.mongodb.net/?retryWrites=true&w=majority";
const options = {
	autoIndex: false, // Don't build indexes
	maxPoolSize: 10, // Maintain up to 10 socket connections
	serverSelectionTimeoutMS: 5000, // Keep trying to send operations for 5 seconds
	socketTimeoutMS: 45000, // Close sockets after 45 seconds of inactivity
	family: 4 // Use IPv4, skip trying IPv6
};
const replyObject = {
	type: 'SUBSCRIPTION_DATA_MESSAGE',
	subscriptionType: '',
	result: ''
};  

var userDetailsSchema=mongoose.Schema({
	email: {type: String, default: 'null'},
	password: {type: String, default: 'null'},
	phone: {type: String, default: 'null'},
	name: {type: String, default: 'null'},
	status: {type: String, default: 'null'},
	profilePicture: {type: String, default: 'null'},
	otp: {type: String, default: 'null'},
	googleAuth: {type: Object, default: {}},
	facebookAuth: {type: Object, default: {}},
	phoneAuth: {type: Object, default: {}},
	deviceToken: {type: String, default: 'No Token'},
	conversations: {type: Object, default: {}},
    groups: {type: Object, default: {}},
    freshLogin: {type: Boolean, default: true},
  });
var accountModel=mongoose.model('accounts',userDetailsSchema);

io.sockets.on('connection', function(ws){
	console.log("FrontEnd and BackEnd Connected via Sockets");
	ws.on('subscribe', (message, callback) => {
		setResult(ws, message, callback);
	});
	ws.on('error', error => {
		console.log(error);
	});
	ws.on('disconnect', (message, callback) => {
		offline(ws, callback);
	});
});

function setResult(ws, message, callback) {
	
	if (message.params.type === 'addUserToDatabase') {
		addUserToDatabase(ws, message, callback);
	}
	else if (message.params.type === 'verifyUser') {
		verifyUser(ws, message, callback);
	}
	else if (message.params.type === 'accessibleContacts') {
		findAccessibleContacts(ws, message, callback);
	}
	else if (message.params.type === 'getNotifications') {
		getNotifications(ws, message, callback);
	}
	else if (message.params.type === 'getOnlineUsers') {
		getOnlineUsers(ws, message, callback);
	}
	else if (message.params.type === 'sendMessage') {
		sendMessage(ws, message, callback);
	}
	else if (message.params.type === 'online') {
		online(ws, message, callback);
	}
	else if (message.params.type === 'inactive') {
		inactive(ws, message, callback);
	}
}

function online(ws, message, callback) {
	ws.Phone = message.params.values;
	userList[ws.Phone]=ws;
	console.log("User:- ", ws.Phone + " " + " is online now")
	// brodcast to all that user is online
}

function offline(ws, message, callback) {
	if(ws.Phone in userList) {
		console.log("User:- ", ws.Phone + " " + " is now disconnected")
		delete userList[ws.Phone];
		var result = replyObject;
			result.subscriptionType = "offline";
			result.type = "offline";
			result.result = "User:- ", ws.Phone + " " + " is now disconnected";
			//callback(result);
	}
    //io.sockets.emit('disconnectedUser',data);
}
function inactive(ws, message, callback) {
	if(message.params.values in userList) {
		console.log("User:- ", ws.Phone + " " + " is now inactive");
		var result = replyObject;
			result.subscriptionType = "inactive";
			result.type = "inactive";
			result.result = "User:- ", ws.Phone + " " + " is now inactive";
			callback(result);
		
	}
    //io.sockets.emit('disconnectedUser',data);
}

function sendMessage(ws, message, callback){
	var data = message.params.values;
	var message={};
	var to=data[0],
		from=data[1],
		senderName=data[2],
		allConversation=data[3],
		msg=data[3].lastMessage;
	var file=from+"_"+to;
	var result = replyObject;
		 result.subscriptionType = "sendMessage";
		 result.type = "sendMessage";
	if(to in userList){ 
	  console.log("sending msg");
	  io.to(userList[to].id).emit('getMessage',{"message":msg, "phone": from});
	  result.result = 'Success';
	  callback(result);
  	}else {
		//save it to notification file
		console.log("user:- ", to + " is offline thus saving it to notifications");
		jsonfile.readFile('./json/notification.json', function(err, obj) {
			if(err){
				console.log('error in reading file, thus creating a new file', err);
				var temp_json={"allmsg":[]};
				temp_json['allmsg'].push({"from":from, "senderName":senderName, "to":to, "numberofmsg":1, "allConversation":allConversation});
				jsonfile.writeFile('./json/notification.json', temp_json, function (err) {
					if(!err) {
						console.log("new file created");
						result.result = 'FailedToSendMessage';
						sendPushNotification(senderName, from, to, msg);
	  					callback(result);
						return ;
					}
					console.log('error in creating a new file', err);
					result.result = 'FileCreationError';
					sendPushNotification(senderName, from, to, msg);
	  				callback(result);
				});
			}
			else{
				console.log('File read successfully')
				var notification_data=obj;var match_count=false;var temp_i;
				for(var i=0;i<notification_data.allmsg.length;i++){
					if(notification_data.allmsg[i].from == from && notification_data.allmsg[i].to == to){
					match_count=true;
					temp_i=i;
					}
				}
				if(match_count == true){
					notification_data.allmsg[temp_i].numberofmsg=notification_data.allmsg[temp_i].numberofmsg+1;
					notification_data.allmsg[temp_i].allConversation = allConversation;
				}
				else{
					notification_data['allmsg'].push({"from":from, "senderName":senderName, "to":to, "numberofmsg":1, "allConversation":allConversation}); 
				}
				jsonfile.writeFile('./json/notification.json', notification_data, function (err) {
					if(!err) {
						console.log("changes added to the file");
						result.result = 'changes added to the file';
						sendPushNotification(senderName, from, to, msg);
	  					callback(result);
						return ;
					}
					console.log('error in updating file', err);
					result.result = 'error is updating file';
					sendPushNotification(senderName, from, to, msg);
	  				callback(result);
				});
			} 
			});
	}
}

function sendPushNotification(senderName, from, to, msg) {
	accountModel.find({phone:to},function(err,docs){
		if(err){
			console.log("Error :- in query");
		}
		else{
			console.log("Success:- records found");
			let msgToSend = message;
			msgToSend.notification.title = 'Message from ' + senderName;
			msgToSend.notification.body = msg;
			if (docs[0].deviceToken != "No Token") {
				admin.messaging().sendToDevice(docs[0].deviceToken, msgToSend, notification_options).then( response => {
					console.log("Push Notification Sent Successfully to :- ", to);
				})
				.catch( error => {
					console.log("Error in Sending the push notification", error);
				});
			}
		}
	});
}

function addingDataToJson(message,file,from,to,msg){
	jsonfile.readFile('json/'+file+'.json', function(err, obj) {
		json_data=obj;
		sendingMsgsToIndividualUsers_me(from,to,msg,json_data.allmsg.length);
		sendingMsgsToIndividualUsers_to(from,to,msg,json_data.allmsg.length);
		message={"from":from, "to":to, "msg":msg}; 
		json_data['allmsg'].push(message); 

		if(msg != "_@:::Not_Typing...:::@_" && msg != "_@:::Typing...:::@_"){
			jsonfile.writeFile('json/'+file+'.json', json_data, function (err) {
				console.error(err)
			});
		}
	});
}

function creatingNewFileWithJson(message,file,from,to,msg){
	message={"allmsg":[{"from":from, "to":to, "msg":msg}]};
	sendingMsgsToIndividualUsers_me(from,to,msg,0);
	sendingMsgsToIndividualUsers_to(from,to,msg,0);
	if(msg != "_@:::Not_Typing...:::@_" && msg != "_@:::Typing...:::@_"){
		jsonfile.writeFile('json/'+file+'.json', message, function (err) {
			console.error(err)
		});
	}
}

function sendingMsgsToIndividualUsers_me(from,to,msg,last_msg_number){
	var temp_json={"allmsg":[]};
	temp_json['allmsg'].push({"from":from, "to":to, "msg":msg, "numberofmsg":last_msg_number});
	if(name_from in Users_email){ 
		console.log("sending msg");
		Users_email[name_from].emit('individual_message_me',temp_json);
	}
}
  
function sendingMsgsToIndividualUsers_to(from,to,msg,name_to,name_from,last_msg_number){
var temp_json={"allmsg":[]};
	temp_json['allmsg'].push({"from":from, "to":to, "msg":msg, "numberofmsg":last_msg_number});
	if(name_to in Users_email){ 
		console.log("sending msg");
		Users_email[name_to].emit('individual_message_to',temp_json);
	}
	else{
		if(msg != "_@:::Not_Typing...:::@_" && msg != "_@:::Typing...:::@_"){
			jsonfile.readFile('json/notification.json', function(err, obj) {
				if(err){
					var temp_json={"allmsg":[]};
					temp_json['allmsg'].push({"from":from, "to":to, "name_to":name_to, "name_from":name_from, "numberofmsg":1});
				jsonfile.writeFile('json/notification.json', temp_json, function (err) {
					console.error(err)
				});
				}
				else{
					var notification_data=obj;var match_count=false;var temp_i;
					for(var i=0;i<notification_data.allmsg.length;i++){
					if(notification_data.allmsg[i].from == from && notification_data.allmsg[i].to == to){
					match_count=true;
					temp_i=i;
					}
					}

					if(match_count == true){
					notification_data.allmsg[temp_i].numberofmsg=notification_data.allmsg[temp_i].numberofmsg+1;
					}
					else{
					notification_data['allmsg'].push({"from":from, "to":to, "name_to":name_to, "name_from":name_from, "numberofmsg":1}); 
					}
					jsonfile.writeFile('json/notification.json', notification_data, function (err) {
						console.error(err)
					});
				} 
			
			});
		}
	}
}

function verifyUser(ws, message, callback) {
	var result = replyObject;
		 result.subscriptionType = "Error";
		 result.type = "Error";
	const phone = message.params.values;
	accountModel.find({phone:phone},function(err,docs){
		if(err){
			console.log("Error :- While finding in Database ", phone);
			result.subscriptionType = "Error";
			callback(result);
		}
		else{
			if(docs.length == 0){
				console.log("Error :- A new User ", phone);
				result.subscriptionType = "Success";
				result.result = "Success";
				callback(result);
			 }
			 else{
				console.log("Error :- Already exist in Database ", phone);
				result.subscriptionType = "AlreadyExist";
				result.result = docs;
				callback(result);
			 }	
		}
	});
}

function findAccessibleContacts(ws, message, callback) {
	var result = replyObject;
		 result.subscriptionType = "accessibleContacts";
		 result.type = "accessibleContacts";
	const contacts = message.params.values;
	const phoneNumberArray = [];
	contacts.forEach((contact) => {
		contact.phoneNumbers.forEach((phone) => {
			let number = (phone.number.length > 10)? phone.number.slice(-10).trim(): phone.number.trim();
			if (number) {
				phoneNumberArray.push(number);
			}
		});
	});
	accountModel.find({phone:{ "$in" : phoneNumberArray}},function(err,docs){
		if(err){
		 console.log("Error :- in query");
		 result.result = "Error";
		 callback(result);
		}
		else{
			console.log("Success:- records found");
			console.log(docs);
			result.result = docs;
			callback(result);
		}
	});
}

function addUserToDatabase(ws, message, callback) {
	var result = replyObject;
		 result.subscriptionType = "Error";
		 result.type = "Error";
	const data = message.params.values;
	var newUser= new accountModel(data);
	newUser.save(function(err){
		if(err){
			console.log("Error :- While adding to database ", data.email);
			result.subscriptionType = "Error";
			 callback(result);
		}
		else{
			console.log("Success :- Added to Database", data.email);
			result.subscriptionType = "Success";
			 callback(result);
		}
	});
}

function updateOnlineMembers(){
	io.sockets.emit('onlineUsers',Object.keys(Users_email));
}

function addOnlineNewMember(data,name){
	io.sockets.emit('newUser',data,name);
}

function deleteDisconnectedMember(data){
	io.sockets.emit('disconnectedUser',data);
}

//notification sending to Users_email
function getNotifications(ws, message, callback){
	var returnResult = [];
	const data = message.params.values;
	var result = replyObject;
	result.subscriptionType = "getNotifications";
	result.type = "getNotifications";
	console.log('inside notifications');
	jsonfile.readFile('./json/notification.json', function(err, obj) {
		if(!err){
			var notification_data=obj;
			console.log('file read successfully');
			for(var i=0;i<notification_data.allmsg.length;i++){
				if(notification_data.allmsg[i].to.toString() == data.toString()){
					var from = notification_data.allmsg[i].from;
					console.log('userId', from);
					console.log('conversation', notification_data.allmsg[i].allConversation);
					returnResult.push({'from':from ,'conversation':notification_data.allmsg[i].allConversation});
				}
			}
			console.log('Sending Notifications');
			callback(returnResult);	
		}
		else {
			result.result = 'error in reading the file';
			console.log('error in reading the file');
			callback(result);
		}
	});
 }

server.listen(port, () => {
	console.log("Server listening on Port :- " + port);
	mongoose.connect(url, options, function(err){
		if(err)console.log("Mongodb database not connected", err);
		else console.log("connected to Mongodb successfully");
		admin.initializeApp({
			credential: admin.credential.cert(serviceAccount)
		  });
	});
});