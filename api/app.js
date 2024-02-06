// app.js
const express = require('express');
const mysql = require('mysql2');
const nodemailer = require('nodemailer');
const bodyParser = require('body-parser');
const pipedrive = require('pipedrive');
const fs = require('fs');
const cors = require('cors');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const { google } = require('googleapis');
const jwt = require('jsonwebtoken');
const app = express();
app.use(cors());
require('dotenv').config();
const oauth2Client = new google.auth.OAuth2(process.env.G_ID, process.env.G_SECRET, process.env.G_API);
oauth2Client.setCredentials({ refresh_token: process.env.G_TOKEN });
const connection = mysql.createConnection({
  host: process.env.DATABASE_HOST || 'database',
  user: process.env.DATABASE_USER,
  password: process.env.DATABASE_PASSWORD,
  database: process.env.DATABASE_NAME,
  port: process.env.DATABASE_PORT || 3306,
});
const pipedriveClient = new pipedrive.ApiClient();
pipedriveClient.authentications.api_key.apiKey = process.env.PIPEDRIVE_API_KEY;
const transporter = nodemailer.createTransport({
  host: process.env.E_SERVER,
  port: process.env.E_PORT,
  secure: false, 
  auth: {
    user: process.env.E_USER,
    pass: process.env.E_PASS,
  },
});




app.use(bodyParser.json());

const addNewOrganization = async (data) => {
  const organizationsApi = new pipedrive.OrganizationsApi(pipedriveClient);
  const organitation = {
    name: data.company
  };
  try {
    const response = await organizationsApi.addOrganization(organitation);
    console.log('Organización agregada exitosamente.');
    return response.data;
  } catch (error) {
    console.error('Error al agregar la organización:', error);
    throw error;
  }
};
const addNewPerson = async (data,organizationId) => {
  const personsApi = new pipedrive.PersonsApi(pipedriveClient);
  const person = {
    name: data.name,
    phone: data.phone,
    email: data.email,
    org_id: organizationId
  };
  try {
    const response = await personsApi.addPerson(person);
    console.log('Persona agregada exitosamente.');
    return response.data;
  } catch (error) {
    console.error('Error al agregar la persona:', error);
    throw error;
  }
};
const addNewLead = async (data, organizationId,personId) => {
  const leadsApi = new pipedrive.LeadsApi(pipedriveClient);
  const lead = {
    title: "API / "+data.company+" / "+data.ranking,
    organization_id: organizationId,
    person_id:personId
  };
  try {
    const response = await leadsApi.addLead(lead);
    console.log('Lead agregado exitosamente.');
    return response.data;
  } catch (error) {
    console.error('Error al agregar el lead:', error);
    throw error;
  }
};
const addCompleteLead = async(data)=>{
  try {
    const newOrganitation = await addNewOrganization(data);
    const newPerson = await addNewPerson(data, newOrganitation.id);
    const newLead = await addNewLead(data, newOrganitation.id,newPerson.id);
    console.log('Lead completo agregado exitosamente.');
    return newLead;
  } catch (error) {
    console.error('Error al agregar el lead:', error);
    throw error;
  }
}
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) {
    return res.sendStatus(401);
  }
  jwt.verify(token, process.env.REACH_SECRET, (err, user) => {
    if (err) {
      return res.sendStatus(403);
    }
    next();
  });
};
app.get('/api/anontoken', (req, res) => {
  const options = {
    expiresIn: '1d',
  };
  const token = jwt.sign({}, process.env.REACH_SECRET, options);
  if(token){
    res.status(200).json({token:token})
  }else{
    res.status(500).json({ error: 'Error al generar Token' });
  }
});

app.post('/api/register',authenticateToken, (req, res) => {
  connection.connect((err) => {
    if(err){
        console.error('Error al conectar a MySQL:', err);
        return;
    }
    console.log('Conexión a MySQL establecida');
});
  const { name, email, company, phone, ranking } = req.body;
  const validationToken = uuidv4();
  const insertUserQuery = `INSERT INTO users (name, email, company, phone, ranking, validation_token, confirmed) 
                           VALUES (?, ?, ?, ?, ?, ?, 0)`;

  connection.query('SELECT * FROM users WHERE email = ?', [email], (error, results) => {
    if(results && results.length > 0){
      res.status(200).json({ message: 'Usuario registrado anteriormente, revisa tu correo para validación.' });
    }else{
      connection.query(
        insertUserQuery,
        [name, email, company, phone, ranking, validationToken],
        (err, results) => {
          if (err) {
            console.error('Error al insertar usuario en la base de datos:', err);
            return res.status(500).json({ error: 'Error interno del servidor' });
          }
    
          const emailTemplatePath = path.join(__dirname, process.env.REACH_PATH, process.env.REACH_TEMPLATE);
          const emailTemplate = fs.readFileSync(emailTemplatePath, 'utf8');
    
          const emailContent = emailTemplate
            .replace('{{name}}', name)
            .replace('{{ranking}}', ranking > 0 && ranking <= 2?"Principiante":ranking > 2 && ranking <= 4?"Intermedio":ranking >4 ?"Avanzado":"" )
            .replace('{{validationLink}}', `${process.env.REACH_BASE_URL}/validate/${validationToken}`);
    
          const mailOptions = {
            from: process.env.REACH_EMAIL,
            to: email,
            subject: process.env.REACH_SUBJECT,
            html: emailContent,
          };
    
          transporter.sendMail(mailOptions, (error) => {
            if (error) {
              console.error('Error al enviar el correo de validación:', error);
              return res.status(500).json({ error: 'Error interno del servidor' });
            }
            res.status(201).json({ message: 'Usuario registrado exitosamente. Se ha enviado un correo de validación.' });
          });
        }
      );
    }
  });
});

app.get('/api/validate/:token',authenticateToken, (req, res) => {
  connection.connect((err) => {
    if(err){
        console.error('Error al conectar a MySQL:', err);
        return;
    }
    console.log('Conexión a MySQL establecida');
});
  const validationToken = req.params.token;
  try {
      connection.query('SELECT * FROM users WHERE validation_token = ?', [validationToken], (error, results) => {
          if (error) {
              res.status(500).json({ error: 'Error al recuperar datos del usuario: '+ error });
          }
          if(results.length > 0){
            const user = results[0]
            if(user.confirmed == 0){
              connection.query('UPDATE users SET confirmed = 1 WHERE validation_token = ? AND confirmed = 0', [validationToken]);
              addCompleteLead(user);
            }
            res.status(200).json(user);

          }else{
              res.status(500).json({ error: 'Error al recuperar datos del usuario. ' });
          }
      });
    } catch (error) {
      console.error('Error al consultar la base de datos: ', error);
      res.status(500).json({ error: 'Error al consultar la base de datos: '+ error });
      throw error;
    }
});

const server = app.listen(3500, () => { 
    console.log(`Server listening on port ${server.address().port}`);
});

