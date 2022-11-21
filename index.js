const express = require('express');
const app = express();
const cors = require('cors');
const server = require('http').createServer(app);
const io = require('socket.io')(server);
const fs = require('fs');
const jsonfile = require('jsonfile');
const mongoose=require('mongoose');

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
	email: String,
	password: String,
	phone: String,
	name: String,
	status: String,
	profilePicture: String,
	otp: String,
	googleAuth: Object,
	facebookAuth: Object,
	phoneAuth: Object
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
});

function setResult(ws, message, callback) {
	
	if (message.params.type === 'addUserToDatabase') {
		addUserToDatabase(ws, message, callback);
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
	else if (message.params.type === 'offline') {
		offline(ws, message, callback);
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
	if(message.params.values in userList) {
		console.log("User:- ", ws.Phone + " " + " is now disconnected")
		delete userList[ws.Phone];
		var result = replyObject;
			result.subscriptionType = "offline";
			result.type = "offline";
			result.result = "User:- ", ws.Phone + " " + " is now disconnected";
			callback(result);
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
		allConversation=data[2],
		msg=data[2].lastMessage;
	var file=from+"_"+to;
	var result = replyObject;
		 result.subscriptionType = "sendMessage";
		 result.type = "sendMessage";
	if(to in userList){ 
	  console.log("sending msg");
	  io.to(userList[to].id).emit('getMessage',{"message":msg, "phone": from});
	  result.result = 'sending msg';
	  callback(result);
  	}else {
		//save it to notification file
		console.log("user:- ", to + " is offline thus saving it to notifications");
		jsonfile.readFile('./json/notification.json', function(err, obj) {
			if(err){
				console.log('error in reading file, thus creating a new file', err);
				var temp_json={"allmsg":[]};
				temp_json['allmsg'].push({"from":from, "to":to, "numberofmsg":1, "allConversation":allConversation});
				jsonfile.writeFile('./json/notification.json', temp_json, function (err) {
					if(!err) {
						console.log("new file created");
						result.result = 'new file created';
	  					callback(result);
						return ;
					}
					console.log('error in creating a new file', err);
					result.result = 'error in crating a new file';
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
					notification_data['allmsg'].push({"from":from, "to":to, "numberofmsg":1, "allConversation":allConversation}); 
				}
				jsonfile.writeFile('./json/notification.json', notification_data, function (err) {
					if(!err) {
						console.log("changes added to the file");
						result.result = 'changes added to the file';
	  					callback(result);
						return ;
					}
					console.log('error in updating file', err);
					result.result = 'error is updating file';
	  				callback(result);
				});
			} 
			});
	}
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
		 result.subscriptionType = "addUserToDatabase";
		 result.type = "addUserToDatabase";
	const data = message.params.values;
	accountModel.find({email:data.email, phone:data.phone},function(err,docs){
		if(err){
		 console.log("Error :- While finding in Database ", data.email);
		 result.result = "Error";
		 callback(result);
		}
		else{
		  if(docs.length == 0){
			 var newUser= new accountModel(data);
			newUser.save(function(err){
				if(err){
					console.log("Error :- While adding to database ", data.email);
					result.result = "Error";
		 			callback(result);
				}
				else{
					console.log("Success :- Added to Database", data.email);
					result.result = "Success";
		 			callback(result);
				}
			});
		  }
		  else{
			console.log("Error :- Already exist in Database ", data.email);
			result.result = "Error";
		 	callback(result);
		  }
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
	const data = message.params.values;
	var result = replyObject;
	result.subscriptionType = "getNotifications";
	result.type = "getNotifications";
	console.log('inside notifications');
	jsonfile.readFile('json/notification.json', function(err, obj) {
		if(!err){
			var notification_data=obj;
			console.log('file read successfully');
			for(var i=0;i<notification_data.allmsg.length;i++){
				if(notification_data.allmsg[i].to == data){
					var to =notification_data.allmsg[i].to;
					console.log('Sending Notifications');
					console.log('userId', from);
					console.log('conversation', notification_data.allmsg[i].allConversation);
					callback({'userId':notification_data.allmsg[i].from, 'conversation':notification_data.allmsg[i].allConversation});	
				}
			}
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
	});
});