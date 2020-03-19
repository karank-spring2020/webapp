const Sequelize = require('sequelize');
const utils = require('../utils');
const uuidv4 = require('uuidv4');
const fs = require('fs');
const AWS = require('aws-sdk');
require('dotenv').config();
var logg = require('../logger');
const SDC = require('statsd-client');
sdc = new SDC({ host: 'localhost', port: 8125 });

module.exports = function (app) {

  const s3 = new AWS.S3({
    accessKeyId: process.env.AWS_ACCESS_KEY,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
  });

  const { Bill, User, AttachFile } = require('../db');

  app.post('/v1/bill', async (req, res) => {
    try {
      var startDate = new Date();
      logg.info("Bill POST Method Call");
      sdc.increment('POST Bill');
      let user = await utils.validateAndGetUser(req, User);

      let bill = await Bill.create({
        id: uuidv4.uuid(),
        vendor: req.body.vendor,
        bill_date: req.body.bill_date,
        due_date: req.body.due_date,
        amount_due: req.body.amount_due,
        payment_status: req.body.payment_status,
        categories: req.body.categories,
        attachment: {}
      });

      await user.addBill(bill);
      res.status(201).send(bill.toJSON());
      logg.info({ success: "success" });
      var endDate = new Date();
      var seconds = (endDate.getTime() - startDate.getTime()) / 1000;
      sdc.timing('api-time-post-bill', seconds);
    } catch (error) {
      let message = null;
      if (error instanceof Sequelize.ValidationError) {
        message = error.errors[0].message;
      }
      res.status(400).send(message || error.toString());
      logg.error({ error: e.toString() });
    }
  });

  app.get('/v1/bills', async (req, res) => {
    try {
      var startDate = new Date();
      logg.info("Bill GET Method Call");
      sdc.increment('GET all Bills');
      const user = await utils.validateAndGetUser(
        req,
        User
      );
      const bills = await user.getBills();


      res.status(200).send(bills);
      logg.info({ success: "success" });
      var endDate = new Date();
      var seconds = (endDate.getTime() - startDate.getTime()) / 1000;
      sdc.timing('api-time-getall-bills', seconds);

    } catch (e) {
      res.status(400).send(e.toString());
      logg.error({ error: e.toString() });
    }
  });

  app.get('/v1/bill/:id', async (req, res) => {
    try {
      var startDate = new Date();
      logg.info("Bill GET Method Call");
      sdc.increment('GET Bill');
      const user = await utils.validateAndGetUser(
        req,
        User
      );
      const id = req.params.id;
      const bills = await user.getBills({
        where: { id: req.params.id }
      });
      if (bills.length == 0) {
        throw new Error('Invalid Bill Id');
        logg.error({ error: 'Invalid Bill Id' });
      }
      bill = bills[0];

      const file = await AttachFile.findOne({
        where: { BillId: req.params.id }
      });

      const attachment = await Bill.update(
        { attachment: file },
        { where: { id: req.params.id } }
      );

      billTable = bill.dataValues;
      res.status(200).send(billTable);
      logg.info({ success: "success" });
      var endDate = new Date();
      var seconds = (endDate.getTime() - startDate.getTime()) / 1000;
      sdc.timing('api-time-get-bill', seconds);
    } catch (e) {
      res.status(400).send(e.toString());
      logg.error({ error: e.toString() });
    }
  });

  app.delete('/v1/bill/:id', async (req, res) => {
    try {
      var startDate = new Date();
      logg.info("Bill DELETE Method Call");
      sdc.increment('DELETE Bills');
      const user = await utils.validateAndGetUser(
        req,
        User
      );
      const bills = await user.getBills({
        where: { id: req.params.id }
      });
      if (bills.length == 0) {
        throw new Error('Invalid Bill Id');
        logg.error({ error: 'Invalid Bill Id' });
      }
      const bill = bills[0];
      //karan
      const attachments = await bill.getAttachFile({
        where: { billId: req.params.id }
      });
      console.log("******" + attachments);
      //karan

      if (attachments != null) {


        var details = {
          Bucket: process.env.S3BUCKET,
          Delete: {
            Objects: [
              {
                Key: req.params.id + "_" + attachments.file_name // required
              }
            ],
          },
        };

        s3.deleteObjects(details, function (error, data) {
          if (error) console.log(error, error.stack);
          else console.log('delete', data);
          if (error) logg.error({ error: error });
        });
      }

      await user.removeBill(bill);
      await Bill.destroy({
        where: { id: req.params.id }
      });
      //karan
      // const attachments = await bill.getAttachFile({
      //   where: { billId: req.params.id }
      // });
      // console.log("******"+attachments);

      await AttachFile.destroy({
        where: { BillId: req.params.id }
      });



      //karan
      res.status(204).send();
      logg.info({ success: "success" });
      var endDate = new Date();
      var seconds = (endDate.getTime() - startDate.getTime()) / 1000;
      sdc.timing('api-time-delete-bill', seconds);
    } catch (e) {
      res.status(400).send(e.toString());
      logg.error({ error: e.toString() });
    }
  });

  app.put('/v1/bill/:id', async (req, res) => {
    try {
      var startDate = new Date();
      logg.info("Bill PUT Method Call");
      sdc.increment('UPDATE Bill');
      const user = await utils.validateAndGetUser(
        req,
        User
      );
      const bills = await user.getBills({
        where: { id: req.params.id }
      });
      if (bills.length == 0) {
        throw new Error('Invalid Bill Id');
        logg.error({ error: 'Invalid Bill Id' });
      }
      const bill = bills[0];

      if (req.body.vendor) {
        bill.vendor = req.body.vendor;
      }
      if (req.body.bill_date) {
        bill.bill_date = req.body.bill_date;
      }
      if (req.body.due_date) {
        bill.due_date = req.body.due_date;
      }
      if (req.body.amount_due < 0.01) {
        throw new Error("Amount can't be less than 0.01")
        logg.error({ error: 'Amount cant be less than 0.01' });
      }
      else {
        bill.amount_due = req.body.amount_due;
      }
      if (req.body.payment_status) {
        bill.payment_status = req.body.payment_status;
      }
      if (req.body.categories) {
        bill.categories = req.body.categories;
      }

      await bill.save();
      res.status(204).send();
      logg.info({ success: "success" });
      var endDate = new Date();
      var seconds = (endDate.getTime() - startDate.getTime()) / 1000;
      sdc.timing('api-time-put-bill', seconds);
    } catch (e) {
      res.status(400).send(e.toString());
      logg.error({ error: e.toString() });
    }
  });
};
