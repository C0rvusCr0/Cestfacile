<?php
if ($_SERVER["REQUEST_METHOD"] == "POST") {

    $name = htmlspecialchars($_POST['name']);
    $email = htmlspecialchars($_POST['email']);
    $message = htmlspecialchars($_POST['message']);

    $to = "contact@cestfacileti.com";
    $subject = "Nouveau message du site web";

    $body = "Nom: $name\n";
    $body .= "Email: $email\n\n";
    $body .= "Message:\n$message";

    $headers = "From: $email";

    mail($to, $subject, $body, $headers);

    header("Location: thankyou.html");
    exit();
}
?>
